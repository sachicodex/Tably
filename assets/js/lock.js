const LOCK_ENABLED_KEY = "tably_lock_enabled";
const LOCK_PASSWORD_KEY = "tably_lock_password";
const LOCK_REQUIRED_KEY = "tably_lock_required_once";
const LOCK_ALT_ENTER_BYPASS_KEY = "tably_lock_alt_enter_bypass";

const form = document.getElementById("lockForm");
const pwd = document.getElementById("pwd");
const err = document.getElementById("err");
const unlockBtn = document.getElementById("unlockBtn");
const unlockBtnLabel = document.getElementById("unlockBtnLabel");

const ext = globalThis.browser ?? globalThis.chrome;
const hasBrowserNamespace = typeof globalThis.browser !== "undefined";
let isUnlockAttempting = false;
let buttonResetTimer = null;
let buttonLabelTimer = null;
const DEFAULT_UNLOCK_LABEL = "Continue";

function isEditableTarget(target) {
  return Boolean(target && target.closest("input, textarea, [contenteditable='true']"));
}

function hardenLockPageInteractions() {
  document.querySelectorAll("img").forEach((img) => {
    img.setAttribute("draggable", "false");
  });

  document.addEventListener("contextmenu", (e) => {
    if (isEditableTarget(e.target)) return;
    e.preventDefault();
  });

  document.addEventListener("dragstart", (e) => {
    if (isEditableTarget(e.target)) return;
    e.preventDefault();
  });

  document.addEventListener("drop", (e) => {
    e.preventDefault();
  });

  document.addEventListener("selectstart", (e) => {
    if (isEditableTarget(e.target)) return;
    e.preventDefault();
  });
}

function getBrowserKind() {
  const ua = (globalThis.navigator && globalThis.navigator.userAgent) || "";
  if (/Firefox\//i.test(ua)) return "firefox";
  if (/Edg\//i.test(ua)) return "edge";
  return "chromium";
}

function newTabCandidates() {
  const extTab = ext.runtime.getURL("index.html");
  const kind = getBrowserKind();
  if (kind === "firefox") return ["about:newtab", extTab];
  if (kind === "edge") return ["edge://newtab/", extTab];
  return ["chrome://newtab/", extTab];
}

function invoke(method, ctx, ...args) {
  if (!method) return Promise.reject(new Error("Missing extension API method"));

  if (hasBrowserNamespace) {
    return method.apply(ctx, args);
  }

  return new Promise((resolve, reject) => {
    method.call(ctx, ...args, (result) => {
      const runtimeErr = globalThis.chrome && globalThis.chrome.runtime && globalThis.chrome.runtime.lastError;
      if (runtimeErr) {
        reject(new Error(runtimeErr.message));
      } else {
        resolve(result);
      }
    });
  });
}

if (pwd) {
  pwd.focus();
}
hardenLockPageInteractions();
animateButtonLabel(DEFAULT_UNLOCK_LABEL);

function animateButtonLabel(text) {
  if (!unlockBtnLabel) return;
  if (buttonLabelTimer) {
    globalThis.clearTimeout(buttonLabelTimer);
    buttonLabelTimer = null;
  }
  if (unlockBtnLabel.textContent === text) return;
  unlockBtnLabel.classList.remove("is-in");
  unlockBtnLabel.classList.add("is-out");
  buttonLabelTimer = globalThis.setTimeout(() => {
    unlockBtnLabel.textContent = text;
    unlockBtnLabel.classList.remove("is-out");
    unlockBtnLabel.classList.add("is-in");
    buttonLabelTimer = null;
  }, 130);
}

function setError(message) {
  if (err) {
    err.textContent = message;
    err.classList.toggle("show", Boolean(message));
  }
  if (pwd) {
    pwd.classList.toggle("input-error", Boolean(message));
  }
}

function setBusyState(isBusy) {
  if (!unlockBtn) return;
  unlockBtn.disabled = isBusy;
  unlockBtn.classList.remove("is-error");
  animateButtonLabel(isBusy ? "Checking..." : DEFAULT_UNLOCK_LABEL);
}

function pulseButtonError(message) {
  if (!unlockBtn) {
    setError("");
    return;
  }

  if (buttonResetTimer) {
    clearTimeout(buttonResetTimer);
    buttonResetTimer = null;
  }

  setError("");
  unlockBtn.classList.add("is-error");
  animateButtonLabel(message);
  buttonResetTimer = globalThis.setTimeout(() => {
    unlockBtn.classList.remove("is-error");
    animateButtonLabel(DEFAULT_UNLOCK_LABEL);
    buttonResetTimer = null;
  }, 1550);
}

async function maximizeWindow(windowId) {
  if (!windowId) return;
  try {
    await invoke(ext.windows.update, ext.windows, windowId, { state: "maximized", focused: true });
  } catch (_) {
    // Ignore maximize failures.
  }
}

async function readLockConfig() {
  try {
    const data = await invoke(ext.storage.local.get, ext.storage.local, [
      LOCK_ENABLED_KEY,
      LOCK_PASSWORD_KEY,
      LOCK_REQUIRED_KEY,
      LOCK_ALT_ENTER_BYPASS_KEY,
    ]);
    return {
      enabled: data[LOCK_ENABLED_KEY] === true,
      password: typeof data[LOCK_PASSWORD_KEY] === "string" ? data[LOCK_PASSWORD_KEY] : "",
      required: data[LOCK_REQUIRED_KEY] !== false,
      altEnterBypass: data[LOCK_ALT_ENTER_BYPASS_KEY] === true,
    };
  } catch (_) {
    return {
      enabled: false,
      password: "",
      required: false,
      altEnterBypass: false,
    };
  }
}

async function openNormalWindowFallback() {
  try {
    await invoke(ext.storage.local.set, ext.storage.local, { [LOCK_REQUIRED_KEY]: false });
  } catch (_) {
    // Ignore storage fallback errors.
  }

  for (const url of newTabCandidates()) {
    try {
      const created = await invoke(ext.windows.create, ext.windows, {
        url,
        type: "normal",
        focused: true,
      });
      await maximizeWindow(created && created.id);

      try {
        const currentWindow = await invoke(ext.windows.getCurrent, ext.windows);
        if (currentWindow && currentWindow.id) {
          await invoke(ext.windows.remove, ext.windows, currentWindow.id);
        }
      } catch (_) {
        // Ignore current-window close failures.
      }

      return;
    } catch (_) {
      // Try next candidate URL.
    }
  }

  for (const url of newTabCandidates()) {
    try {
      window.location.href = url;
      return;
    } catch (_) {
      // Try next fallback URL.
    }
  }
}

async function unlockNow() {
  if (isUnlockAttempting) return;
  isUnlockAttempting = true;
  setBusyState(true);

  if (ext && ext.runtime && ext.runtime.sendMessage) {
    ext.runtime.sendMessage({ type: "UNLOCK_TABLY" }, async (response) => {
      const runtimeErr = globalThis.chrome && globalThis.chrome.runtime && globalThis.chrome.runtime.lastError;
      if (!runtimeErr && response && response.ok) {
        isUnlockAttempting = false;
        setBusyState(false);
        return;
      }

      await openNormalWindowFallback();
      isUnlockAttempting = false;
      setBusyState(false);
    });
    return;
  }

  await openNormalWindowFallback();
  isUnlockAttempting = false;
  setBusyState(false);
}

async function maybeSkipLockScreen() {
  const lockConfig = await readLockConfig();
  if (!lockConfig.enabled || !lockConfig.required) {
    setError("");
    await unlockNow();
  }
}

maybeSkipLockScreen();

if (form) {
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const value = pwd ? pwd.value.trim() : "";
    const lockConfig = await readLockConfig();

    if (!lockConfig.enabled) {
      setError("Lock is disabled.");
      await unlockNow();
      return;
    }

    if (!lockConfig.password) {
      pulseButtonError("No password set");
      return;
    }

    if (value !== lockConfig.password) {
      pulseButtonError("Password Incorrect");
      if (pwd) pwd.select();
      return;
    }

    setError("");
    if (pwd) pwd.value = "";
    await unlockNow();
  });

  document.addEventListener("keydown", async (e) => {
    if (e.altKey && e.key === "Enter") {
      const lockConfig = await readLockConfig();
      if (!lockConfig.enabled || !lockConfig.required) {
        e.preventDefault();
        setError("");
        await unlockNow();
        return;
      }

      if (!lockConfig.altEnterBypass) return;
      e.preventDefault();
      setError("");
      await unlockNow();
    }
  });
}

if (ext && ext.storage && ext.storage.onChanged) {
  ext.storage.onChanged.addListener(async (changes, areaName) => {
    if (areaName !== "local") return;

    const lockDisabled =
      Object.prototype.hasOwnProperty.call(changes, LOCK_ENABLED_KEY) &&
      changes[LOCK_ENABLED_KEY] &&
      changes[LOCK_ENABLED_KEY].newValue !== true;
    const lockNoLongerRequired =
      Object.prototype.hasOwnProperty.call(changes, LOCK_REQUIRED_KEY) &&
      changes[LOCK_REQUIRED_KEY] &&
      changes[LOCK_REQUIRED_KEY].newValue === false;

    if (lockDisabled || lockNoLongerRequired) {
      setError("");
      await unlockNow();
    }
  });
}
