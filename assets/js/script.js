const searchInput = document.getElementById("searchInput");
const weekdayText = document.getElementById("weekdayText");
const clockText = document.getElementById("clockText");
const clockBlock = document.getElementById("clockBlock");
const searchSection = document.getElementById("searchSection");
const searchSuggestions = document.getElementById("searchSuggestions");
const micButton = document.getElementById("micButton");
const quickLinksSection = document.getElementById("quickLinksSection");
const dockSection = document.getElementById("dockSection");
const quickLinkCards = Array.from(document.querySelectorAll(".quick-link-card"));
const dockButtons = Array.from(document.querySelectorAll(".dock-icon"));

const quickLinksEditor = document.getElementById("quickLinksEditor");
const saveQuickLinksBtn = document.getElementById("saveQuickLinksBtn");
const resetQuickLinksBtn = document.getElementById("resetQuickLinksBtn");
const quickLinksStatus = document.getElementById("quickLinksStatus");

const dockEditor = document.getElementById("dockEditor");
const saveDockBtn = document.getElementById("saveDockBtn");
const resetDockBtn = document.getElementById("resetDockBtn");
const dockStatus = document.getElementById("dockStatus");
const addDockItemBtn = document.getElementById("addDockItemBtn");

let isAppLocked = false;
let recentSearches = [];
let searchSuggestionItems = [];
let suggestionCursor = -1;
let suggestionFetchToken = 0;
let searchSuggestionTimer = 0;
let speechRecognition = null;
let isVoiceListening = false;
let voiceHasTranscript = false;
let voiceBaseValue = "";
let voiceStopRequested = false;
let voiceLastError = "";

function hideSearchSuggestions() {
  if (!searchSuggestions) return;
  searchSuggestions.classList.add("is-hidden");
  searchSuggestions.innerHTML = "";
  searchSuggestionItems = [];
  suggestionCursor = -1;
}

function setSuggestionCursor(nextIndex) {
  if (!searchSuggestions || !searchSuggestionItems.length) return;

  const clampedIndex = Math.max(0, Math.min(nextIndex, searchSuggestionItems.length - 1));
  suggestionCursor = clampedIndex;

  const suggestionElements = searchSuggestions.querySelectorAll(".search-suggestion-item");
  suggestionElements.forEach((item, index) => {
    item.classList.toggle("is-active", index === suggestionCursor);
  });
}

function formatSuggestionLabel(value, maxChars = 58) {
  const normalized = cleanText(value);
  if (!normalized) return "";
  if (normalized.length <= maxChars) return normalized;

  const words = normalized.split(/\s+/).filter(Boolean);
  if (words.length < 3) {
    return `${normalized.slice(0, Math.max(0, maxChars - 3)).trim()}...`;
  }

  let headCount = Math.min(3, words.length - 1);
  let tailCount = Math.min(2, words.length - headCount);

  const build = () => {
    const head = words.slice(0, headCount).join(" ");
    const tail = words.slice(-tailCount).join(" ");
    return `${head} ... ${tail}`;
  };

  let composed = build();
  while (composed.length > maxChars && (headCount > 1 || tailCount > 1)) {
    if (headCount >= tailCount && headCount > 1) {
      headCount -= 1;
    } else if (tailCount > 1) {
      tailCount -= 1;
    }
    composed = build();
  }

  if (composed.length <= maxChars) return composed;
  return `${words[0]} ... ${words[words.length - 1]}`;
}

function renderSearchSuggestions(items) {
  if (!searchSuggestions) return;

  if (!Array.isArray(items) || !items.length) {
    hideSearchSuggestions();
    return;
  }

  searchSuggestionItems = items;
  suggestionCursor = -1;
  searchSuggestions.innerHTML = "";

  items.forEach((text) => {
    const value = cleanText(text);
    if (!value) return;

    const button = document.createElement("button");
    button.type = "button";
    button.className = "search-suggestion-item";
    button.setAttribute("data-value", value);
    button.setAttribute("title", value);
    button.textContent = formatSuggestionLabel(value);
    searchSuggestions.appendChild(button);
  });

  searchSuggestions.classList.remove("is-hidden");
}

function composeSearchSuggestions(query, historyItems, generatedItems) {
  const normalizedQuery = cleanText(query);
  if (!normalizedQuery) {
    return Array.isArray(historyItems) ? historyItems.slice(0, 5) : [];
  }

  const result = [normalizedQuery];
  const seen = new Set([normalizedQuery.toLowerCase()]);

  const addUnique = (item) => {
    const normalized = cleanText(item);
    if (!normalized) return false;
    const key = normalized.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    result.push(normalized);
    return true;
  };

  let historyCount = 0;
  for (const item of historyItems || []) {
    if (historyCount >= 2) break;
    if (addUnique(item)) historyCount += 1;
  }

  const remainingSlotsAfterHistory = Math.max(0, 4 - historyCount);
  let generatedCount = 0;
  for (const item of generatedItems || []) {
    if (generatedCount >= remainingSlotsAfterHistory || result.length >= 5) break;
    if (addUnique(item)) generatedCount += 1;
  }

  return result.slice(0, 5);
}

function getRecentSuggestions(query) {
  const normalizedQuery = cleanText(query).toLowerCase();
  if (!normalizedQuery) {
    return recentSearches.slice(0, 5);
  }

  return recentSearches.filter((item) => item.toLowerCase().includes(normalizedQuery)).slice(0, 5);
}

async function fetchGoogleSuggestions(query) {
  const normalized = cleanText(query);
  if (!normalized) return [];

  const localVariants = [
    normalized,
    `${normalized} meaning`,
    `${normalized} near me`,
    `${normalized} today`,
    `how to ${normalized}`,
    `best ${normalized}`,
  ];

  return localVariants.slice(0, 5);
}

async function saveRecentSearch(query) {
  const normalized = cleanText(query);
  if (!normalized) return;

  recentSearches = [
    normalized,
    ...recentSearches.filter((item) => item.toLowerCase() !== normalized.toLowerCase()),
  ].slice(0, 10);

  try {
    await writeStoredValue(RECENT_SEARCHES_KEY, recentSearches);
  } catch (_) {}
}

async function runSearch(query) {
  const normalized = cleanText(query);
  if (!normalized) return;

  await saveRecentSearch(normalized);
  hideSearchSuggestions();
  window.open(`https://www.google.com/search?q=${encodeURIComponent(normalized)}`, "_self");
}

async function updateSearchSuggestions() {
  if (!searchInput || !searchSuggestions || isAppLocked) return;

  const query = cleanText(searchInput.value);
  if (!query) {
    renderSearchSuggestions(getRecentSuggestions(""));
    return;
  }

  const token = ++suggestionFetchToken;
  const [remoteSuggestions, localSuggestions] = await Promise.all([
    fetchGoogleSuggestions(query),
    Promise.resolve(getRecentSuggestions(query)),
  ]);

  if (token !== suggestionFetchToken) return;
  renderSearchSuggestions(composeSearchSuggestions(query, localSuggestions, remoteSuggestions));
}

function scheduleSearchSuggestions() {
  clearTimeout(searchSuggestionTimer);
  searchSuggestionTimer = window.setTimeout(() => {
    updateSearchSuggestions();
  }, 140);
}

function setMicListeningState(listening) {
  isVoiceListening = listening;
  if (!micButton) return;
  micButton.classList.toggle("is-listening", listening);
  micButton.setAttribute("aria-pressed", String(listening));
}

function getSpeechRecognitionConstructor() {
  if (typeof window === "undefined") return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

function setTemporarySearchPlaceholder(message, duration = 1700) {
  if (!searchInput) return;
  const originalPlaceholder = searchInput.placeholder;
  searchInput.placeholder = message;
  window.setTimeout(() => {
    searchInput.placeholder = originalPlaceholder;
  }, duration);
}

function startVoiceRecognition(SpeechRecognitionCtor) {
  if (!searchInput) return;

  if (speechRecognition) {
    try {
      speechRecognition.abort();
    } catch (_) {}
    speechRecognition = null;
  }

  const recognition = new SpeechRecognitionCtor();
  speechRecognition = recognition;
  recognition.lang = "en-US";
  recognition.interimResults = true;
  recognition.continuous = true;
  recognition.maxAlternatives = 1;

  recognition.onstart = () => {
    voiceStopRequested = false;
    voiceLastError = "";
    voiceHasTranscript = false;
    voiceBaseValue = cleanText(searchInput.value);
    setMicListeningState(true);
    searchInput.focus();
  };

  recognition.onresult = (event) => {
    if (!searchInput) return;

    let finalTranscript = "";
    let interimTranscript = "";

    for (let i = 0; i < event.results.length; i += 1) {
      const segment = event.results[i][0]?.transcript || "";
      if (event.results[i].isFinal) {
        finalTranscript += `${segment} `;
      } else {
        interimTranscript += segment;
      }
    }

    const spokenText = cleanText(`${finalTranscript}${interimTranscript}`);
    const nextValue = cleanText(`${voiceBaseValue} ${spokenText}`);
    searchInput.value = nextValue;
    voiceHasTranscript = Boolean(nextValue);
    scheduleSearchSuggestions();
  };

  recognition.onerror = (event) => {
    voiceLastError = event?.error || "";
    setMicListeningState(false);
    if (event?.error === "not-allowed") {
      setTemporarySearchPlaceholder("Mic permission blocked");
    } else if (event?.error === "no-speech") {
      setTemporarySearchPlaceholder("No speech detected");
    }
  };

  recognition.onend = () => {
    setMicListeningState(false);

    if (
      !voiceStopRequested &&
      speechRecognition === recognition &&
      voiceLastError !== "not-allowed" &&
      voiceLastError !== "service-not-allowed" &&
      !isAppLocked
    ) {
      try {
        recognition.start();
        return;
      } catch (_) {}
    }

    if (voiceHasTranscript && searchInput) {
      searchInput.focus();
      scheduleSearchSuggestions();
    }

    if (speechRecognition === recognition) {
      speechRecognition = null;
    }
  };

  try {
    recognition.start();
  } catch (_) {
    setMicListeningState(false);
    setTemporarySearchPlaceholder("Voice start failed. Try again");
    speechRecognition = null;
  }
}

if (micButton) {
  micButton.addEventListener("click", () => {
    if (isAppLocked) return;

    const SpeechRecognitionCtor = getSpeechRecognitionConstructor();
    if (!SpeechRecognitionCtor) {
      setTemporarySearchPlaceholder("Voice typing is not supported in this browser");
      return;
    }

    if (isVoiceListening && speechRecognition) {
      voiceStopRequested = true;
      speechRecognition.stop();
      return;
    }

    startVoiceRecognition(SpeechRecognitionCtor);
  });
}

if (searchInput) {
  searchInput.addEventListener("keydown", (e) => {
    if (isAppLocked) return;

    if (e.key === "ArrowDown") {
      if (!searchSuggestionItems.length) return;
      e.preventDefault();
      setSuggestionCursor(suggestionCursor + 1);
      return;
    }

    if (e.key === "ArrowUp") {
      if (!searchSuggestionItems.length) return;
      e.preventDefault();
      setSuggestionCursor(suggestionCursor - 1);
      return;
    }

    if (e.key === "Escape") {
      hideSearchSuggestions();
      return;
    }

    if (e.key !== "Enter") return;

    e.preventDefault();
    const selectedSuggestion = searchSuggestionItems[suggestionCursor];
    void runSearch(selectedSuggestion || searchInput.value);
  });

  searchInput.addEventListener("input", () => {
    if (isAppLocked) return;
    scheduleSearchSuggestions();
  });

  searchInput.addEventListener("focus", () => {
    if (isAppLocked) return;
    scheduleSearchSuggestions();
  });
}

if (searchSuggestions) {
  searchSuggestions.addEventListener("mousedown", (e) => {
    e.preventDefault();
  });

  searchSuggestions.addEventListener("click", (e) => {
    if (isAppLocked) return;

    const button = e.target.closest(".search-suggestion-item");
    if (!button) return;

    const value = cleanText(button.getAttribute("data-value"));
    if (!value) return;

    if (searchInput) {
      searchInput.value = value;
    }

    void runSearch(value);
  });
}

document.addEventListener("keydown", (e) => {
  if (isAppLocked) return;
  const target = e.target;
  if (!target) return;

  if (target.tagName !== "INPUT" && target.tagName !== "TEXTAREA" && !target.isContentEditable) {
    const searchHidden = searchSection && searchSection.classList.contains("is-hidden");
    if (searchInput && !searchHidden) searchInput.focus();
  }
});

document.addEventListener("click", (e) => {
  if (!searchSection || !searchSuggestions || !searchInput) return;
  if (searchSection.contains(e.target)) return;

  hideSearchSuggestions();
});

const dock = document.querySelector("nav.dock");
if (dock) {
  dock.addEventListener("click", (e) => {
    if (isAppLocked) return;
    const button = e.target.closest(".dock-icon");
    if (!button) return;

    let url = button.getAttribute("data-url") || "";
    if (!url || url === "#") url = "https://github.com/";

    window.open(url, "_self");
  });
}

function disableImageInteractions() {
  document.querySelectorAll("img").forEach((img) => {
    img.setAttribute("draggable", "false");
  });
}

disableImageInteractions();

document.addEventListener("contextmenu", (e) => {
  const target = e.target;
  if (!target) return;

  if (target.closest("input, textarea, [contenteditable='true']")) return;
  e.preventDefault();
});

document.addEventListener("dragstart", (e) => {
  const target = e.target;
  if (!target) return;

  if (target.closest("input, textarea, [contenteditable='true']")) return;
  e.preventDefault();
});

document.addEventListener("drop", (e) => {
  e.preventDefault();
});

function updateClock() {
  const now = new Date();

  if (weekdayText) {
    weekdayText.textContent = now.toLocaleDateString("en-US", { weekday: "long" });
  }

  if (clockText) {
    const hours = String(now.getHours()).padStart(2, "0");
    const minutes = String(now.getMinutes()).padStart(2, "0");
    clockText.textContent = `${hours}:${minutes}`;
  }
}

updateClock();
setInterval(updateClock, 1000);

const sidebar = document.getElementById("sidebar");
const sidebarCloseButtons = document.querySelectorAll(".sidebar-close-btn");
const sidebarOpenBtn = document.getElementById("sidebar-open-btn");
const sidebarBackdrop = document.getElementById("sidebar-backdrop");

function setSidebarOpen(isOpen) {
  if (isAppLocked && isOpen) return;
  if (!sidebar || !sidebarBackdrop) return;

  sidebar.classList.toggle("is-open", isOpen);
  sidebarBackdrop.classList.toggle("is-open", isOpen);
  sidebar.setAttribute("aria-hidden", String(!isOpen));
  sidebar.setAttribute("data-open", String(isOpen));
  if (sidebarOpenBtn) {
    sidebarOpenBtn.classList.toggle("is-hidden", isOpen);
  }
}

function closeSidebar() {
  setSidebarOpen(false);
}

sidebarCloseButtons.forEach((btn) => {
  btn.addEventListener("click", closeSidebar);
});

if (sidebarOpenBtn) {
  sidebarOpenBtn.addEventListener("click", () => {
    if (isAppLocked) return;
    setSidebarOpen(true);
  });
}

if (sidebarBackdrop) {
  sidebarBackdrop.addEventListener("click", closeSidebar);
}

if (sidebar) {
  sidebar.addEventListener("click", (e) => {
    const btn = e.target.closest(".sidebar-close-btn");
    if (btn) closeSidebar();
  });
}

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    closeSidebar();
  }
});

const settingsView = document.getElementById("settingsView");
const customizeView = document.getElementById("customizeView");
const customize02View = document.getElementById("customize02View");
const lockSetupView = document.getElementById("lockSetupView");
const openCustomizeBtn = document.getElementById("openCustomizeBtn");
const openCustomize02Btn = document.getElementById("openCustomize02Btn");
const openLockSetupBtn = document.getElementById("openLockSetupBtn");
const backToSettingsBtn = document.getElementById("backToSettingsBtn");
const backToSettingsFromBgBtn = document.getElementById("backToSettingsFromBgBtn");
const backToSettingsFromLockBtn = document.getElementById("backToSettingsFromLockBtn");

function showSidebarView(viewName) {
  if (!settingsView || !customizeView || !customize02View || !lockSetupView) return;
  settingsView.classList.toggle("is-hidden", viewName !== "settings");
  customizeView.classList.toggle("is-hidden", viewName !== "customize");
  customize02View.classList.toggle("is-hidden", viewName !== "customize02");
  lockSetupView.classList.toggle("is-hidden", viewName !== "lockSetup");
}

if (openCustomizeBtn) {
  openCustomizeBtn.addEventListener("click", () => {
    if (isAppLocked) return;
    showSidebarView("customize");
  });
}

if (openCustomize02Btn) {
  openCustomize02Btn.addEventListener("click", () => {
    if (isAppLocked) return;
    showSidebarView("customize02");
  });
}

if (openLockSetupBtn) {
  openLockSetupBtn.addEventListener("click", () => {
    if (isAppLocked) return;
    showSidebarView("lockSetup");
  });
}

if (backToSettingsBtn) {
  backToSettingsBtn.addEventListener("click", () => showSidebarView("settings"));
}

if (backToSettingsFromBgBtn) {
  backToSettingsFromBgBtn.addEventListener("click", () => showSidebarView("settings"));
}

if (backToSettingsFromLockBtn) {
  backToSettingsFromLockBtn.addEventListener("click", () => showSidebarView("settings"));
}

showSidebarView("settings");

const VISIBILITY_KEY = "tably_visibility_settings";
const CUSTOM_BG_KEY = "tably_custom_bg_image";
const QUICK_LINKS_KEY = "tably_quick_links_config";
const DOCK_LINKS_KEY = "tably_dock_links_config";
const RECENT_SEARCHES_KEY = "tably_recent_searches";
const LOCK_ENABLED_KEY = "tably_lock_enabled";
const LOCK_PASSWORD_KEY = "tably_lock_password";
const LOCK_REQUIRED_KEY = "tably_lock_required_once";
const LOCK_ALT_ENTER_BYPASS_KEY = "tably_lock_alt_enter_bypass";
const defaultVisibility = {
  weekday: true,
  time: true,
  searchBar: true,
  quickLinks: true,
  dock: true,
};

const visibilityToggles = {
  weekday: document.getElementById("toggleWeekday"),
  time: document.getElementById("toggleTime"),
  searchBar: document.getElementById("toggleSearchBar"),
  quickLinks: document.getElementById("toggleQuickLinks"),
  dock: document.getElementById("toggleDock"),
};

const openDarkFlagBtn = document.getElementById("openDarkFlagBtn");
const darkFlagStatus = document.getElementById("darkFlagStatus");
const darkFlagUrl = "chrome://flags/#enable-force-dark";
const openBgPickerBtn = document.getElementById("openBgPickerBtn");
const bgImageInput = document.getElementById("bgImageInput");
const bgImageStatus = document.getElementById("bgImageStatus");

const lockEnabledToggle = document.getElementById("lockEnabledToggle");
const lockAltEnterBypassToggle = document.getElementById("lockAltEnterBypassToggle");
const lockPasswordSetupInput = document.getElementById("lockPasswordSetupInput");
const saveLockSetupBtn = document.getElementById("saveLockSetupBtn");
const lockSetupStatus = document.getElementById("lockSetupStatus");

const lockConfig = {
  enabled: false,
  password: "",
  altEnterBypass: false,
};

const defaultQuickLinks = quickLinkCards.map((card, index) => ({
  label: `Quick ${index + 1}`,
  url: card.getAttribute("data-default-url") || card.getAttribute("href") || "",
  image: card.getAttribute("data-default-image") || "",
}));

const defaultDockLinks = dockButtons.map((button, index) => {
  const img = button.querySelector("img");
  return {
    label: img?.getAttribute("alt") || `Dock ${index + 1}`,
    url: button.getAttribute("data-default-url") || button.getAttribute("data-url") || "",
    image: img?.getAttribute("data-default-image") || img?.getAttribute("src") || "",
  };
});
const MAX_DOCK_ITEMS = 12;

function hasChromeStorage() {
  return (
    typeof chrome !== "undefined" &&
    chrome.storage &&
    chrome.storage.local &&
    typeof chrome.storage.local.get === "function"
  );
}

async function readStoredValue(key) {
  if (hasChromeStorage()) {
    const data = await chrome.storage.local.get(key);
    return data[key];
  }

  try {
    const raw = localStorage.getItem(key);
    if (!raw) return undefined;
    try {
      return JSON.parse(raw);
    } catch (_) {
      return raw;
    }
  } catch (_) {
    return undefined;
  }
}

async function writeStoredValue(key, value) {
  if (hasChromeStorage()) {
    await chrome.storage.local.set({ [key]: value });
    return;
  }

  localStorage.setItem(key, JSON.stringify(value));
}

function cleanText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function escapeCssUrl(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function normalizeLinkItems(savedData, defaults) {
  const savedItems = Array.isArray(savedData) ? savedData : [];
  return defaults.map((item, index) => {
    const saved = savedItems[index] || {};
    const url = cleanText(saved.url) || item.url;
    const image = cleanText(saved.image) || item.image;
    return {
      label: item.label,
      url,
      image,
    };
  });
}

function normalizeDockItems(savedData, defaults) {
  const savedItems = Array.isArray(savedData) ? savedData : [];
  const baseItems = defaults.map((item, index) => {
    const saved = savedItems[index] || {};
    return {
      label: cleanText(saved.label) || item.label,
      url: cleanText(saved.url) || item.url,
      image: cleanText(saved.image) || item.image,
    };
  });

  const extraItems = savedItems
    .slice(defaults.length)
    .map((saved, index) => {
      const label = cleanText(saved?.label) || `Dock ${defaults.length + index + 1}`;
      return {
        label,
        url: cleanText(saved?.url),
        image: cleanText(saved?.image),
      };
    })
    .slice(0, Math.max(0, MAX_DOCK_ITEMS - baseItems.length));

  return [...baseItems, ...extraItems];
}

function getEditorItems(container) {
  if (!container) return [];

  const rows = Array.from(container.querySelectorAll(".custom-item-row"));
  return rows.map((row, index) => {
    const urlInput = row.querySelector(".custom-url-input");
    const imageInput = row.querySelector(".custom-image-input");
    return {
      label: row.getAttribute("data-label") || `Item ${index + 1}`,
      url: cleanText(urlInput?.value),
      image: cleanText(imageInput?.value),
    };
  });
}

function resolveItemConfigFromEditor(items, defaults) {
  return defaults.map((item, index) => {
    const editorItem = items[index] || {};
    return {
      label: item.label,
      url: cleanText(editorItem.url) || item.url,
      image: cleanText(editorItem.image) || item.image,
    };
  });
}

function resolveDockConfigFromEditor(items, defaults) {
  const baseItems = defaults.map((item, index) => {
    const editorItem = items[index] || {};
    return {
      label: cleanText(editorItem.label) || item.label,
      url: cleanText(editorItem.url) || item.url,
      image: cleanText(editorItem.image) || item.image,
    };
  });

  const extraItems = items
    .slice(defaults.length)
    .map((item, index) => ({
      label: cleanText(item?.label) || `Dock ${defaults.length + index + 1}`,
      url: cleanText(item?.url),
      image: cleanText(item?.image),
    }))
    .slice(0, Math.max(0, MAX_DOCK_ITEMS - baseItems.length));

  return [...baseItems, ...extraItems];
}

function validateDockConfig(config) {
  const items = Array.isArray(config) ? config : [];
  for (let i = defaultDockLinks.length; i < items.length; i += 1) {
    const item = items[i];
    if (!cleanText(item?.url)) {
      return {
        ok: false,
        message: `Dock ${i + 1}: URL is required.`,
        index: i,
        field: "url",
      };
    }
    if (!cleanText(item?.image)) {
      return {
        ok: false,
        message: `Dock ${i + 1}: Image is required.`,
        index: i,
        field: "image",
      };
    }
  }

  return { ok: true };
}

function updateEditorPreview(row, imageUrl) {
  const preview = row.querySelector(".custom-item-preview");
  if (!preview) return;
  if (!imageUrl) {
    preview.style.backgroundImage = "";
    preview.classList.add("is-empty");
    return;
  }

  preview.style.backgroundImage = `url("${escapeCssUrl(imageUrl)}")`;
  preview.classList.remove("is-empty");
}

function setEditorStatus(element, message) {
  if (!element) return;
  element.textContent = message;
}

function initActionButton(button) {
  if (!button || button.querySelector(".button-label")) return;

  const defaultLabel = cleanText(button.textContent) || "Save";
  button.setAttribute("data-default-label", defaultLabel);
  button.innerHTML = "";

  const label = document.createElement("span");
  label.className = "button-label";
  label.textContent = defaultLabel;

  button.append(label);
}

function animateActionButtonLabel(button, nextLabel) {
  const labelNode = button?.querySelector(".button-label");
  if (!labelNode) return;

  const currentLabel = labelNode.textContent || "";
  if (currentLabel === nextLabel) return;

  const activeTimer = Number(button.getAttribute("data-label-timer")) || 0;
  if (activeTimer) {
    window.clearTimeout(activeTimer);
    button.removeAttribute("data-label-timer");
  }

  labelNode.classList.remove("is-in");
  labelNode.classList.add("is-out");

  const timer = window.setTimeout(() => {
    labelNode.textContent = nextLabel;
    labelNode.classList.remove("is-out");
    labelNode.classList.add("is-in");

    const clearTimer = window.setTimeout(() => {
      labelNode.classList.remove("is-in");
      button.removeAttribute("data-label-timer");
    }, 170);

    button.setAttribute("data-label-timer", String(clearTimer));
  }, 90);

  button.setAttribute("data-label-timer", String(timer));
}

function setActionButtonState(button, state) {
  if (!button) return;
  initActionButton(button);

  const labelNode = button.querySelector(".button-label");
  if (!labelNode) return;

  const label =
    typeof state?.label === "string" && state.label
      ? state.label
      : button.getAttribute("data-default-label") || "Save";

  const isLoading = state?.loading === true;
  const tone = state?.tone || "default";

  animateActionButtonLabel(button, label);
  button.classList.toggle("is-loading", isLoading);
  button.classList.toggle("is-success", tone === "success");
  button.classList.toggle("is-error", tone === "error");
  button.disabled = isLoading;
  button.setAttribute("aria-busy", String(isLoading));
}

function resetActionButton(button) {
  if (!button) return;
  const defaultLabel = button.getAttribute("data-default-label") || "Save";
  setActionButtonState(button, { label: defaultLabel, loading: false, tone: "default" });
}

function flashActionButton(button, label, tone = "success", duration = 1600) {
  if (!button) return;

  const previousTimer = Number(button.getAttribute("data-flash-timer")) || 0;
  if (previousTimer) {
    window.clearTimeout(previousTimer);
    button.removeAttribute("data-flash-timer");
  }

  setActionButtonState(button, { label, loading: false, tone });

  const timer = window.setTimeout(() => {
    resetActionButton(button);
    button.removeAttribute("data-flash-timer");
  }, duration);

  button.setAttribute("data-flash-timer", String(timer));
}

function renderLinkEditor(container, items, options = {}) {
  if (!container) return;
  container.innerHTML = "";

  items.forEach((item, index) => {
    const row = document.createElement("div");
    row.className = "custom-item-row";
    row.setAttribute("data-label", item.label);

    const top = document.createElement("div");
    top.className = "custom-item-top";

    const title = document.createElement("div");
    title.className = "custom-item-title";
    title.textContent = item.label;

    const topActions = document.createElement("div");
    topActions.className = "custom-item-actions";

    const preview = document.createElement("div");
    preview.className = "custom-item-preview";
    topActions.append(preview);

    top.append(title, topActions);

    const urlInput = document.createElement("input");
    urlInput.className = "sidebar-input custom-url-input";
    urlInput.type = "url";
    urlInput.placeholder = "Destination URL";
    urlInput.value = item.url;

    const urlLabel = document.createElement("div");
    urlLabel.className = "custom-field-label";
    urlLabel.textContent = "URL";

    const urlField = document.createElement("div");
    urlField.className = "custom-field";

    const imageRow = document.createElement("div");
    imageRow.className = "custom-image-row";

    const imageInput = document.createElement("input");
    imageInput.className = "sidebar-input custom-image-input";
    imageInput.type = "url";
    imageInput.placeholder = "Image URL";
    imageInput.value = item.image;

    const uploadBtn = document.createElement("button");
    uploadBtn.className = "sidebar-action-btn";
    uploadBtn.type = "button";
    uploadBtn.textContent = "Upload";

    let deleteBtn = null;
    if (options.allowDelete === true) {
      const canDelete =
        typeof options.canDelete === "function" ? options.canDelete(item, index, items) : true;
      if (canDelete) {
        deleteBtn = document.createElement("button");
        deleteBtn.className = "sidebar-action-btn sidebar-danger-btn sidebar-icon-btn";
        deleteBtn.type = "button";
        deleteBtn.setAttribute("aria-label", `Delete ${item.label || `Dock ${index + 1}`}`);
        deleteBtn.setAttribute("title", "Delete");
        deleteBtn.innerHTML =
          '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
          '<path d="M10 11V17" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/>' +
          '<path d="M14 11V17" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/>' +
          '<path d="M4 7H20" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/>' +
          '<path d="M6 7L7 19C7.08 20.09 7.98 20.93 9.07 20.93H14.93C16.02 20.93 16.92 20.09 17 19L18 7" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/>' +
          '<path d="M9 7V5.6C9 4.72 9.72 4 10.6 4H13.4C14.28 4 15 4.72 15 5.6V7" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/>' +
          "</svg>";
        deleteBtn.addEventListener("click", () => {
          if (typeof options.onDelete === "function") {
            options.onDelete(index, items);
          }
        });
      }
    }

    const fileInput = document.createElement("input");
    fileInput.className = "hidden-file-input";
    fileInput.type = "file";
    fileInput.accept = "image/*";

    const imageLabel = document.createElement("div");
    imageLabel.className = "custom-field-label";
    imageLabel.textContent = "Image";

    const imageField = document.createElement("div");
    imageField.className = "custom-field";

    uploadBtn.addEventListener("click", () => fileInput.click());
    imageInput.addEventListener("input", () => {
      updateEditorPreview(row, cleanText(imageInput.value));
    });
    fileInput.addEventListener("change", () => {
      const [file] = fileInput.files || [];
      if (!file || !file.type.startsWith("image/")) {
        fileInput.value = "";
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = String(reader.result || "");
        imageInput.value = dataUrl;
        updateEditorPreview(row, dataUrl);
      };
      reader.readAsDataURL(file);
      fileInput.value = "";
    });

    imageRow.append(imageInput);
    if (deleteBtn) imageRow.append(deleteBtn);
    imageRow.append(uploadBtn, fileInput);
    urlField.append(urlLabel, urlInput);
    imageField.append(imageLabel, imageRow);
    row.append(top, urlField, imageField);
    container.appendChild(row);
    updateEditorPreview(row, item.image);
  });
}

function renderDockEditor(items) {
  renderLinkEditor(dockEditor, items, {
    allowDelete: true,
    canDelete: (_item, _index, allItems) => Array.isArray(allItems) && allItems.length > 1,
    onDelete: (index, allItems) => {
      const nextItems = allItems.filter((_, itemIndex) => itemIndex !== index);
      renderDockEditor(nextItems);
      setEditorStatus(dockStatus, "");
      resetActionButton(saveDockBtn);
    },
  });
}

function applyQuickLinksConfig(config) {
  quickLinkCards.forEach((card, index) => {
    const item = config[index];
    if (!item) return;

    card.setAttribute("href", item.url || "#");
    if (item.image) {
      card.style.backgroundImage = `url("${escapeCssUrl(item.image)}")`;
    } else {
      card.style.backgroundImage = "";
    }
  });
}

function applyDockConfig(config) {
  if (!dockSection) return;

  dockSection.innerHTML = "";
  const items = Array.isArray(config) ? config : [];
  const emptyDockSvg =
    "data:image/svg+xml;utf8," +
    encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" rx="14" fill="#ffffff"/><circle cx="32" cy="32" r="14" fill="#d8deea"/></svg>'
    );

  items.forEach((item, index) => {
    const button = document.createElement("button");
    button.className = "dock-icon white";
    button.setAttribute("data-dock-index", String(index));
    button.setAttribute("data-url", item.url || "#");
    button.setAttribute("data-default-url", item.url || "#");

    const img = document.createElement("img");
    img.setAttribute("src", cleanText(item.image) || emptyDockSvg);
    img.setAttribute("alt", cleanText(item.label) || `Dock ${index + 1}`);
    img.setAttribute("data-default-image", cleanText(item.image) || fallbackImage);

    button.append(img);
    dockSection.append(button);
  });

  disableImageInteractions();
}

function applyVisibilitySettings(settings) {
  if (weekdayText) weekdayText.classList.toggle("is-hidden", !settings.weekday);
  if (clockText) clockText.classList.toggle("is-hidden", !settings.time);
  if (clockBlock) clockBlock.classList.toggle("is-hidden", !settings.weekday && !settings.time);

  if (searchSection) {
    searchSection.classList.toggle("is-hidden", !settings.searchBar);
    if (!settings.searchBar) hideSearchSuggestions();
  }
  if (quickLinksSection) quickLinksSection.classList.toggle("is-hidden", !settings.quickLinks);
  if (dockSection) dockSection.classList.toggle("is-hidden", !settings.dock);
}

function normalizeVisibilitySettings(data) {
  const parsed = data && typeof data === "object" ? data : {};
  return {
    weekday: parsed.weekday !== false,
    time: parsed.time !== false,
    searchBar: parsed.searchBar !== false,
    quickLinks: parsed.quickLinks !== false,
    dock: parsed.dock !== false,
  };
}

function setBgImageStatus(message) {
  if (!bgImageStatus) return;
  bgImageStatus.textContent = message;
}

function applyCustomBackground(dataUrl) {
  if (dataUrl) {
    document.body.style.backgroundImage = `url("${dataUrl}")`;
  } else {
    document.body.style.backgroundImage = "";
  }
}

function setDarkFlagStatus(message) {
  if (!darkFlagStatus) return;
  darkFlagStatus.textContent = message;
}

function setLockSetupStatus(message) {
  if (!lockSetupStatus) return;
  lockSetupStatus.textContent = message;
}

function applyLockSetupState() {
  if (!lockEnabledToggle) return;

  const enabled = Boolean(lockEnabledToggle.checked);
  if (lockPasswordSetupInput) {
    lockPasswordSetupInput.disabled = !enabled;
  }
  if (lockAltEnterBypassToggle) {
    lockAltEnterBypassToggle.disabled = !enabled;
  }

  if (!enabled) {
    if (lockPasswordSetupInput) {
      lockPasswordSetupInput.value = "";
    }
    if (lockAltEnterBypassToggle) {
      lockAltEnterBypassToggle.checked = false;
    }
  }
}

const visibilitySettings = { ...defaultVisibility };
Object.entries(visibilityToggles).forEach(([key, input]) => {
  if (!input) return;
  input.addEventListener("change", async () => {
    if (isAppLocked) return;
    visibilitySettings[key] = input.checked;
    applyVisibilitySettings(visibilitySettings);
    await writeStoredValue(VISIBILITY_KEY, visibilitySettings);
  });
});

if (openBgPickerBtn && bgImageInput) {
  openBgPickerBtn.addEventListener("click", () => {
    if (isAppLocked) return;
    bgImageInput.click();
  });

  bgImageInput.addEventListener("change", async () => {
    if (isAppLocked) return;
    const [file] = bgImageInput.files || [];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setBgImageStatus("Please choose an image file.");
      bgImageInput.value = "";
      return;
    }

    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = String(reader.result || "");
      try {
        await writeStoredValue(CUSTOM_BG_KEY, dataUrl);
        applyCustomBackground(dataUrl);
        setBgImageStatus("Custom background applied.");
      } catch (_) {
        setBgImageStatus("Image is too large to save. Try a smaller one.");
      }
      bgImageInput.value = "";
    };
    reader.onerror = () => {
      setBgImageStatus("Could not read image. Please try again.");
      bgImageInput.value = "";
    };
    reader.readAsDataURL(file);
  });
}

if (saveQuickLinksBtn) {
  saveQuickLinksBtn.addEventListener("click", async () => {
    if (isAppLocked) return;
    setEditorStatus(quickLinksStatus, "");
    setActionButtonState(saveQuickLinksBtn, { label: "Saving...", loading: true });
    const rawItems = getEditorItems(quickLinksEditor);
    const config = resolveItemConfigFromEditor(rawItems, defaultQuickLinks);

    try {
      await writeStoredValue(QUICK_LINKS_KEY, config);
      applyQuickLinksConfig(config);
      setEditorStatus(quickLinksStatus, "");
      flashActionButton(saveQuickLinksBtn, "Saved", "success");
    } catch (_) {
      setActionButtonState(saveQuickLinksBtn, { label: "Save failed", loading: false, tone: "error" });
      flashActionButton(saveQuickLinksBtn, "Save failed", "error", 2200);
      setEditorStatus(quickLinksStatus, "Could not save quick links. Try smaller images.");
    }
  });
}

if (resetQuickLinksBtn) {
  resetQuickLinksBtn.addEventListener("click", async () => {
    if (isAppLocked) return;
    setEditorStatus(quickLinksStatus, "");
    setActionButtonState(resetQuickLinksBtn, { label: "Resetting...", loading: true });
    const defaults = defaultQuickLinks.map((item) => ({ ...item }));
    try {
      await writeStoredValue(QUICK_LINKS_KEY, defaults);
      renderLinkEditor(quickLinksEditor, defaults);
      applyQuickLinksConfig(defaults);
      setEditorStatus(quickLinksStatus, "");
      flashActionButton(resetQuickLinksBtn, "Reset", "success");
    } catch (_) {
      flashActionButton(resetQuickLinksBtn, "Reset failed", "error", 2200);
      setEditorStatus(quickLinksStatus, "Could not reset quick links.");
    }
  });
}

if (saveDockBtn) {
  saveDockBtn.addEventListener("click", async () => {
    if (isAppLocked) return;
    setEditorStatus(dockStatus, "");
    setActionButtonState(saveDockBtn, { label: "Saving...", loading: true });
    const rawItems = getEditorItems(dockEditor);
    const config = resolveDockConfigFromEditor(rawItems, defaultDockLinks);
    const validation = validateDockConfig(config);
    if (!validation.ok) {
      flashActionButton(saveDockBtn, "Fix required fields", "error", 2200);
      setEditorStatus(dockStatus, validation.message || "Dock fields are required.");
      if (dockEditor) {
        const rows = Array.from(dockEditor.querySelectorAll(".custom-item-row"));
        const row = rows[validation.index] || null;
        const selector = validation.field === "image" ? ".custom-image-input" : ".custom-url-input";
        const targetInput = row?.querySelector(selector);
        if (targetInput) targetInput.focus();
      }
      return;
    }

    try {
      await writeStoredValue(DOCK_LINKS_KEY, config);
      applyDockConfig(config);
      setEditorStatus(dockStatus, "");
      flashActionButton(saveDockBtn, "Saved", "success");
    } catch (_) {
      flashActionButton(saveDockBtn, "Save failed", "error", 2200);
      setEditorStatus(dockStatus, "Could not save dock. Try smaller images.");
    }
  });
}

if (addDockItemBtn) {
  addDockItemBtn.addEventListener("click", () => {
    if (isAppLocked) return;
    setEditorStatus(dockStatus, "");
    const currentItems = getEditorItems(dockEditor);
    if (currentItems.length >= MAX_DOCK_ITEMS) {
      setEditorStatus(dockStatus, `Maximum ${MAX_DOCK_ITEMS} dock items allowed.`);
      return;
    }

    const nextIndex = currentItems.length + 1;
    currentItems.push({
      label: `Dock ${nextIndex}`,
      url: "",
      image: "",
    });

    renderDockEditor(currentItems);
    resetActionButton(saveDockBtn);
    flashActionButton(addDockItemBtn, "Added", "success", 1100);
  });
}

if (resetDockBtn) {
  resetDockBtn.addEventListener("click", async () => {
    if (isAppLocked) return;
    setEditorStatus(dockStatus, "");
    setActionButtonState(resetDockBtn, { label: "Resetting...", loading: true });
    const defaults = defaultDockLinks.map((item) => ({ ...item }));
    try {
      await writeStoredValue(DOCK_LINKS_KEY, defaults);
      renderDockEditor(defaults);
      applyDockConfig(defaults);
      setEditorStatus(dockStatus, "");
      flashActionButton(resetDockBtn, "Reset", "success");
    } catch (_) {
      flashActionButton(resetDockBtn, "Reset failed", "error", 2200);
      setEditorStatus(dockStatus, "Could not reset dock.");
    }
  });
}

if (openDarkFlagBtn) {
  openDarkFlagBtn.addEventListener("click", async () => {
    if (isAppLocked) return;
    setDarkFlagStatus("");

    if (typeof chrome !== "undefined" && chrome.tabs && chrome.tabs.create) {
      chrome.tabs.create({ url: darkFlagUrl }, async () => {
        if (chrome.runtime && chrome.runtime.lastError) {
          const copied = await copyDarkFlagUrl();
          setDarkFlagStatus(
            copied
              ? "Chrome blocked opening this page. URL copied. Paste in address bar."
              : "Chrome blocked opening this page. Copy and open: chrome://flags/#enable-force-dark"
          );
        }
      });
      return;
    }

    const copied = await copyDarkFlagUrl();
    setDarkFlagStatus(
      copied
        ? "URL copied. Paste in address bar: chrome://flags/#enable-force-dark"
        : "Copy and open: chrome://flags/#enable-force-dark"
    );
  });
}

if (lockEnabledToggle) {
  lockEnabledToggle.addEventListener("change", () => {
    setLockSetupStatus("");
    applyLockSetupState();
    resetActionButton(saveLockSetupBtn);
  });
}

if (lockPasswordSetupInput) {
  lockPasswordSetupInput.addEventListener("input", () => {
    setLockSetupStatus("");
    resetActionButton(saveLockSetupBtn);
  });
}

if (lockAltEnterBypassToggle) {
  lockAltEnterBypassToggle.addEventListener("change", () => {
    setLockSetupStatus("");
    resetActionButton(saveLockSetupBtn);
  });
}

if (saveLockSetupBtn) {
  saveLockSetupBtn.addEventListener("click", async () => {
    if (isAppLocked) return;
    if (!lockEnabledToggle || !lockPasswordSetupInput) return;
    setActionButtonState(saveLockSetupBtn, { label: "Saving...", loading: true });

    const enabled = Boolean(lockEnabledToggle.checked);
    const password = lockPasswordSetupInput.value.trim();
    const altEnterBypass = enabled && Boolean(lockAltEnterBypassToggle?.checked);

    if (enabled && !password) {
      flashActionButton(saveLockSetupBtn, "Enter password", "error", 2200);
      setLockSetupStatus("");
      lockPasswordSetupInput.focus();
      return;
    }

    try {
      await writeStoredValue(LOCK_ENABLED_KEY, enabled);
      await writeStoredValue(LOCK_PASSWORD_KEY, enabled ? password : "");
      await writeStoredValue(LOCK_REQUIRED_KEY, enabled);
      await writeStoredValue(LOCK_ALT_ENTER_BYPASS_KEY, altEnterBypass);

      lockConfig.enabled = enabled;
      lockConfig.password = enabled ? password : "";
      lockConfig.altEnterBypass = altEnterBypass;

      if (enabled) {
        flashActionButton(saveLockSetupBtn, "Lock enabled", "success");
      } else {
        flashActionButton(saveLockSetupBtn, "Lock is disabled", "success");
      }
      setLockSetupStatus("");
    } catch (_) {
      flashActionButton(saveLockSetupBtn, "Save failed", "error", 2200);
      setLockSetupStatus("Could not save lock settings. Try again.");
    }
  });
}

async function copyDarkFlagUrl() {
  if (!navigator.clipboard) return false;
  try {
    await navigator.clipboard.writeText(darkFlagUrl);
    return true;
  } catch (_) {
    return false;
  }
}

async function initSavedSettings() {
  initActionButton(saveQuickLinksBtn);
  initActionButton(resetQuickLinksBtn);
  initActionButton(saveDockBtn);
  initActionButton(resetDockBtn);
  initActionButton(saveLockSetupBtn);

  const savedRecentSearches = await readStoredValue(RECENT_SEARCHES_KEY);
  recentSearches = Array.isArray(savedRecentSearches)
    ? savedRecentSearches
        .filter((item) => typeof item === "string")
        .map((item) => cleanText(item))
        .filter(Boolean)
        .slice(0, 10)
    : [];

  const savedVisibility = await readStoredValue(VISIBILITY_KEY);
  Object.assign(visibilitySettings, normalizeVisibilitySettings(savedVisibility));
  applyVisibilitySettings(visibilitySettings);

  Object.entries(visibilityToggles).forEach(([key, input]) => {
    if (!input) return;
    input.checked = Boolean(visibilitySettings[key]);
  });

  const savedBg = await readStoredValue(CUSTOM_BG_KEY);
  if (typeof savedBg === "string" && savedBg) {
    applyCustomBackground(savedBg);
  }

  const savedQuickLinks = await readStoredValue(QUICK_LINKS_KEY);
  const quickConfig = normalizeLinkItems(savedQuickLinks, defaultQuickLinks);
  applyQuickLinksConfig(quickConfig);
  renderLinkEditor(quickLinksEditor, quickConfig);

  const savedDockLinks = await readStoredValue(DOCK_LINKS_KEY);
  const dockConfig = normalizeDockItems(savedDockLinks, defaultDockLinks);
  applyDockConfig(dockConfig);
  renderDockEditor(dockConfig);

  const savedLockEnabled = await readStoredValue(LOCK_ENABLED_KEY);
  const savedLockPassword = await readStoredValue(LOCK_PASSWORD_KEY);
  const savedLockAltEnterBypass = await readStoredValue(LOCK_ALT_ENTER_BYPASS_KEY);

  lockConfig.enabled = savedLockEnabled === true;
  lockConfig.password = typeof savedLockPassword === "string" ? savedLockPassword : "";
  lockConfig.altEnterBypass = lockConfig.enabled && savedLockAltEnterBypass === true;

  if (lockEnabledToggle) {
    lockEnabledToggle.checked = lockConfig.enabled;
  }

  if (lockPasswordSetupInput) {
    lockPasswordSetupInput.value = lockConfig.enabled ? lockConfig.password : "";
  }
  if (lockAltEnterBypassToggle) {
    lockAltEnterBypassToggle.checked = lockConfig.altEnterBypass;
  }

  applyLockSetupState();
}

initSavedSettings();
