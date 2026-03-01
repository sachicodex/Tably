const LOCK_REQUIRED_KEY = "tably_lock_required_once";
const LOCK_ENABLED_KEY = "tably_lock_enabled";
const LOCK_PENDING_URL_KEY = "tably_lock_pending_url";
const ext = globalThis.browser ?? globalThis.chrome;
const hasBrowserNamespace = typeof globalThis.browser !== "undefined";
const LOCK_URL = ext.runtime.getURL("lock.html");
const EXT_NEWTAB_URL = ext.runtime.getURL("index.html");
const LOCK_WINDOW_WIDTH = 1000;
const LOCK_WINDOW_HEIGHT = 600;
let isUnlocking = false;
let ensureLockWindowInFlight = null;

function getBrowserKind() {
  const ua = (globalThis.navigator && globalThis.navigator.userAgent) || "";
  if (/Firefox\//i.test(ua)) return "firefox";
  if (/Edg\//i.test(ua)) return "edge";
  return "chromium";
}

function newTabCandidates() {
  const kind = getBrowserKind();
  if (kind === "firefox") return ["about:newtab", EXT_NEWTAB_URL];
  if (kind === "edge") return ["edge://newtab/", EXT_NEWTAB_URL];
  return ["chrome://newtab/", EXT_NEWTAB_URL];
}

function invoke(method, ctx, ...args) {
  if (!method) return Promise.reject(new Error("Missing extension API method"));

  if (hasBrowserNamespace) {
    return method.apply(ctx, args);
  }

  return new Promise((resolve, reject) => {
    method.call(ctx, ...args, (result) => {
      const err = globalThis.chrome && globalThis.chrome.runtime && globalThis.chrome.runtime.lastError;
      if (err) {
        reject(new Error(err.message));
      } else {
        resolve(result);
      }
    });
  });
}

async function getLockEnabled() {
  const data = await invoke(ext.storage.local.get, ext.storage.local, LOCK_ENABLED_KEY);
  return data[LOCK_ENABLED_KEY] === true;
}

async function getLockRequired() {
  const data = await invoke(ext.storage.local.get, ext.storage.local, LOCK_REQUIRED_KEY);
  return data[LOCK_REQUIRED_KEY] !== false;
}

async function setLockRequired(required) {
  await invoke(ext.storage.local.set, ext.storage.local, { [LOCK_REQUIRED_KEY]: required });
}

function isPendingUrlCandidate(url) {
  if (typeof url !== "string") return false;
  const value = url.trim();
  if (!value) return false;
  if (value === LOCK_URL || value === EXT_NEWTAB_URL) return false;
  if (newTabCandidates().includes(value)) return false;
  if (value === "about:blank") return false;
  return true;
}

async function setPendingUrl(url) {
  if (!isPendingUrlCandidate(url)) return;
  try {
    await invoke(ext.storage.local.set, ext.storage.local, { [LOCK_PENDING_URL_KEY]: url });
  } catch (_) {
    // Ignore transient storage errors.
  }
}

async function clearPendingUrl() {
  try {
    await invoke(ext.storage.local.remove, ext.storage.local, LOCK_PENDING_URL_KEY);
  } catch (_) {
    // Ignore transient storage errors.
  }
}

async function takePendingUrl() {
  try {
    const data = await invoke(ext.storage.local.get, ext.storage.local, LOCK_PENDING_URL_KEY);
    const pendingUrl = data[LOCK_PENDING_URL_KEY];
    await clearPendingUrl();
    if (isPendingUrlCandidate(pendingUrl)) return pendingUrl;
  } catch (_) {
    // Ignore storage failures and continue with default tab flow.
  }
  return null;
}

async function closeLockWindows() {
  const lockTabs = await invoke(ext.tabs.query, ext.tabs, { url: LOCK_URL });
  const lockWindowIds = [...new Set(lockTabs.map((tab) => tab.windowId))];

  await Promise.all(
    lockWindowIds.map(async (windowId) => {
      try {
        await invoke(ext.windows.remove, ext.windows, windowId);
      } catch (_) {
        // Ignore windows that are already closed.
      }
    })
  );
}

async function getCenteredLockBounds() {
  try {
    const lastFocused = await invoke(ext.windows.getLastFocused, ext.windows, { populate: false });
    if (
      !lastFocused ||
      typeof lastFocused.left !== "number" ||
      typeof lastFocused.top !== "number" ||
      typeof lastFocused.width !== "number" ||
      typeof lastFocused.height !== "number"
    ) {
      return null;
    }

    return {
      left: Math.round(lastFocused.left + (lastFocused.width - LOCK_WINDOW_WIDTH) / 2),
      top: Math.round(lastFocused.top + (lastFocused.height - LOCK_WINDOW_HEIGHT) / 2),
    };
  } catch (_) {
    return null;
  }
}

async function ensureLockWindow() {
  if (ensureLockWindowInFlight) {
    return ensureLockWindowInFlight;
  }

  ensureLockWindowInFlight = (async () => {
    const centeredBounds = await getCenteredLockBounds();
    const lockTabs = await invoke(ext.tabs.query, ext.tabs, { url: LOCK_URL });
    if (lockTabs.length > 0) {
      const primaryWindowId = lockTabs[0].windowId;
      const duplicateWindowIds = [
        ...new Set(lockTabs.map((tab) => tab.windowId).filter((windowId) => windowId !== primaryWindowId)),
      ];

      await Promise.all(
        duplicateWindowIds.map(async (windowId) => {
          try {
            await invoke(ext.windows.remove, ext.windows, windowId);
          } catch (_) {
            // Ignore windows that are already closed.
          }
        })
      );

      try {
        await invoke(ext.windows.update, ext.windows, primaryWindowId, {
          focused: true,
          width: LOCK_WINDOW_WIDTH,
          height: LOCK_WINDOW_HEIGHT,
          state: "normal",
          ...(centeredBounds || {}),
        });
      } catch (_) {
        // Ignore focus errors.
      }
      return;
    }

    try {
      await invoke(ext.windows.create, ext.windows, {
        url: LOCK_URL,
        type: "popup",
        width: LOCK_WINDOW_WIDTH,
        height: LOCK_WINDOW_HEIGHT,
        focused: true,
        ...(centeredBounds || {}),
      });
    } catch (_) {
      // Ignore popup creation failures.
    }
  })().finally(() => {
    ensureLockWindowInFlight = null;
  });

  return ensureLockWindowInFlight;
}

async function closeAllNormalWindows() {
  const windows = await invoke(ext.windows.getAll, ext.windows, { windowTypes: ["normal"] });
  await Promise.all(
    windows.map(async (win) => {
      try {
        await invoke(ext.windows.remove, ext.windows, win.id);
      } catch (_) {
        // Ignore windows that cannot be closed.
      }
    })
  );
}

async function maximizeWindow(windowId) {
  if (!windowId) return;
  try {
    await invoke(ext.windows.update, ext.windows, windowId, { state: "maximized", focused: true });
  } catch (_) {
    // Ignore maximize failures on unsupported platforms.
  }
}

function buildOpenCandidates(preferredUrl) {
  const defaults = newTabCandidates();
  if (!isPendingUrlCandidate(preferredUrl)) return defaults;
  return [preferredUrl, ...defaults];
}

async function openNormalBrowserWindow(preferredUrl = null) {
  for (const url of buildOpenCandidates(preferredUrl)) {
    try {
      const created = await invoke(ext.windows.create, ext.windows, {
        url,
        type: "normal",
        focused: true,
      });
      await maximizeWindow(created && created.id);
      return true;
    } catch (_) {
      // Try next candidate URL.
    }
  }

  for (const url of buildOpenCandidates(preferredUrl)) {
    try {
      await invoke(ext.tabs.create, ext.tabs, { url });
      return true;
    } catch (_) {
      // Try next fallback.
    }
  }

  return false;
}

async function onSessionStart() {
  const enabled = await getLockEnabled();
  if (!enabled) {
    await setLockRequired(false);
    await clearPendingUrl();
    await closeLockWindows();
    return;
  }

  await setLockRequired(true);
  await ensureLockWindow();
  await closeAllNormalWindows();
}

async function unlockAndResume() {
  isUnlocking = true;
  await setLockRequired(false);
  const pendingUrl = await takePendingUrl();

  await openNormalBrowserWindow(pendingUrl);
  await closeLockWindows();

  const normalWindows = await invoke(ext.windows.getAll, ext.windows, { windowTypes: ["normal"] });
  if (normalWindows.length === 0) {
    await openNormalBrowserWindow();
  }

  isUnlocking = false;
}

ext.runtime.onInstalled.addListener(onSessionStart);
ext.runtime.onStartup.addListener(onSessionStart);

ext.windows.onCreated.addListener(async (window) => {
  if (!window || window.type !== "normal") return;
  if (isUnlocking) return;

  const enabled = await getLockEnabled();
  if (!enabled) return;

  const required = await getLockRequired();
  if (!required) return;

  try {
    const tabs = await invoke(ext.tabs.query, ext.tabs, { windowId: window.id });
    const firstTab = tabs[0];
    await setPendingUrl((firstTab && (firstTab.pendingUrl || firstTab.url)) || "");
  } catch (_) {
    // Ignore missing tabs while window initializes.
  }

  await ensureLockWindow();
  try {
    await invoke(ext.windows.remove, ext.windows, window.id);
  } catch (_) {
    // Ignore windows that cannot be closed.
  }
});

ext.windows.onRemoved.addListener(async () => {
  if (isUnlocking) return;

  const enabled = await getLockEnabled();
  if (!enabled) return;

  const normalWindows = await invoke(ext.windows.getAll, ext.windows, { windowTypes: ["normal"] });
  if (normalWindows.length === 0) {
    await setLockRequired(true);
  }

  const required = await getLockRequired();
  if (required) {
    await ensureLockWindow();
  }
});

ext.tabs.onUpdated.addListener(async (_tabId, changeInfo, tab) => {
  if (isUnlocking) return;
  if (!tab || !tab.windowId) return;
  if (changeInfo.status !== "loading" && !changeInfo.url) return;

  const enabled = await getLockEnabled();
  if (!enabled) return;

  const required = await getLockRequired();
  if (!required) return;

  try {
    const win = await invoke(ext.windows.get, ext.windows, tab.windowId);
    if (win.type !== "normal") return;
    await setPendingUrl(changeInfo.url || tab.pendingUrl || tab.url || "");
    await ensureLockWindow();
    await invoke(ext.windows.remove, ext.windows, win.id);
  } catch (_) {
    // Ignore tabs/windows that are gone.
  }
});

if (ext.storage && ext.storage.onChanged) {
  ext.storage.onChanged.addListener(async (changes, areaName) => {
    if (areaName !== "local") return;
    if (!Object.prototype.hasOwnProperty.call(changes, LOCK_ENABLED_KEY)) return;

    const enabled = changes[LOCK_ENABLED_KEY] && changes[LOCK_ENABLED_KEY].newValue === true;

    if (!enabled) {
      await setLockRequired(false);
      await clearPendingUrl();
      await closeLockWindows();
      return;
    }

    await setLockRequired(true);
    await ensureLockWindow();
    await closeAllNormalWindows();
  });
}

ext.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || typeof message !== "object") return;
  if (message.type !== "UNLOCK_TABLY") return;

  unlockAndResume()
    .then(() => sendResponse({ ok: true }))
    .catch(() => {
      isUnlocking = false;
      sendResponse({ ok: false });
    });
  return true;
});
