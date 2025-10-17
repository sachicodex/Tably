// script.js
// -----------------------------
// 🌟 Gemini Chat Renderer 2.0 (Enhanced for Nova Studio)
// -----------------------------

let isGeminiMode = false;

// 🧠 Utility: Exponential Backoff
const exponentialBackoff = async (fn, maxRetries = 5, delay = 1000) => {
  for (let i = 0; i < maxRetries; i++) {
    try { return await fn(); }
    catch (err) {
      if (i === maxRetries - 1) throw err;
      await new Promise(r => setTimeout(r, delay * Math.pow(2, i)));
    }
  }
};

// 🧩 DOM References
const searchInput = document.getElementById("searchInput");
const geminiToggle = document.getElementById("geminiModeToggle");
const geminiQaSection = document.getElementById("geminiQaSection");
const geminiResultsEl = document.getElementById("geminiResults");
const aiLoadingIndicator = document.getElementById("aiLoadingIndicator");
const geminiContent = document.getElementById("geminiContent");
const searchIconEl = document.querySelector('.search-icon');

// 🔐 API Config
const apiKey = "AIzaSyBOONNHz9MLRyFyNE4u82JhAiD1svmOp3s";
const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;

// 🧾 Decode HTML Entities
function decodeHtmlEntities(text) {
  if (!text || typeof text !== 'string') return text;
  const txt = document.createElement('textarea');
  txt.innerHTML = text;
  return txt.value;
}

// 🔥 Escape HTML safely
function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// 🎨 Display Markdown-rendered content
function displayResults(text, sources = []) {
  aiLoadingIndicator.classList.add('hidden');
  geminiContent.classList.remove('hidden');

  if (typeof marked === 'undefined' || typeof hljs === 'undefined') {
    geminiContent.textContent = text;
  } else {
    const decoded = decodeHtmlEntities(text);
    marked.setOptions({
      breaks: true,
      gfm: true,
      smartLists: true,
      highlight: (code, lang) => {
        try {
          return lang && hljs.getLanguage(lang)
            ? hljs.highlight(code, { language: lang }).value
            : hljs.highlightAuto(code).value;
        } catch {
          return hljs.highlightAuto(code).value;
        }
      }
    });

    try {
      geminiContent.innerHTML = marked.parse(decoded);
    } catch {
      geminiContent.innerHTML = `<pre>${escapeHtml(decoded)}</pre>`;
    }

    // Highlight all code blocks
    if (typeof hljs.highlightAll === 'function') hljs.highlightAll();
  }

  // 🧾 Add Sources (if any)
  if (sources.length > 0) {
    const srcHtml = `
      <div class="mt-4 pt-3 border-t border-white/20">
        <p class="text-sm font-semibold opacity-80 mb-1">🔗 Sources:</p>
        ${sources.map((s, i) => `
          <a href="${s.uri || '#'}" target="_blank" class="citation-source">
            ${i + 1}. ${escapeHtml(s.title || s.uri || 'Source')}
          </a>`).join('')}
      </div>`;
    geminiContent.insertAdjacentHTML('beforeend', srcHtml);
  }
}

// ⚙️ Core API Call
async function callGeminiAPI(query) {
  if (!query) return;

  // 🌈 UI States
  geminiQaSection.classList.remove('hidden');
  aiLoadingIndicator.classList.remove('hidden');
  geminiContent.classList.add('hidden');
  geminiContent.innerHTML = '';

  // 🎭 Random Thinking Texts with Emojis
  const thinkingMessages = [
    "💭 Thinking deeply...",
    "⚡ Gathering thoughts...",
    "🤖 Crunching some ideas...",
    "🧠 Processing info...",
    "🔍 Searching my digital brain...",
    "✨ Crafting something awesome..."
  ];
  const typingText = document.querySelector('.typing-text');
  if (typingText) typingText.textContent = thinkingMessages[Math.floor(Math.random() * thinkingMessages.length)];

  // 🧠 System Prompt (AI Personality + Formatting)
  const systemPrompt = `
You are Nova Studio's built-in AI assistant 🤖 — friendly, stylish, and helpful.
Your goals:
- Always reply in full **GitHub-style Markdown** (with headings, bold, italics, code blocks, and tables).
- Use emojis naturally to match the tone 🌈.
- Keep the content **well-organized, easy to read**, and **visually formatted**.
- Maintain a positive, encouraging, and tech-savvy personality (think helpful Gen Z developer 💻✨).
`;

  // 💬 User Prompt Template
  const userPrompt = `
User asked: "${query}"

Format your response like this:
- Start with a short summary or greeting with an emoji.
- Use **headings** (H1, H2, etc.) for structure.
- Use **bullet points** or **steps** when explaining.
- Use **code blocks** for examples with syntax highlighting.
- Use **tables** for comparisons or structured data.
- Keep it short, friendly, and visually appealing 🎨.
`;

  // 📨 Payload
  const payload = {
    contents: [{ parts: [{ text: userPrompt }] }],
    tools: [{ "google_search": {} }],
    systemInstruction: { parts: [{ text: systemPrompt }] }
  };

  try {
    const response = await exponentialBackoff(() =>
      fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
    );

    if (!response.ok) throw new Error(`HTTP ${response.status}: ${await response.text()}`);

    const result = await response.json();
    const candidate = result?.candidates?.[0];
    let generatedText = candidate?.content?.parts?.[0]?.text ?? "⚠️ No response received.";
    generatedText = String(generatedText);

    // 🔗 Get sources
    let sources = [];
    const grounding = candidate?.groundingMetadata;
    if (grounding?.groundingAttributions) {
      sources = grounding.groundingAttributions.map(at => ({
        uri: at.web?.uri,
        title: at.web?.title
      })).filter(s => s.uri || s.title);
    }

    displayResults(generatedText, sources);
  } catch (err) {
    console.error("Gemini API error:", err);
    displayResults("⚠️ Oops! I couldn’t reach Gemini right now. Try again in a bit!");
  }
}

// 🌙 Toggle Gemini Mode
function toggleGeminiMode() {
  isGeminiMode = !isGeminiMode;
  geminiToggle.classList.toggle("gemini-active", isGeminiMode);
  geminiQaSection.classList.add('hidden');
  geminiContent.innerHTML = '';
  aiLoadingIndicator.classList.add('hidden');
  geminiContent.classList.remove('hidden');

  if (isGeminiMode) {
    searchInput.placeholder = "Ask anything...";
    if (searchIconEl) searchIconEl.style.color = '#4285f4';
    document.body.classList.add('gemini-mode-active');
  } else {
    searchInput.placeholder = "Search the web...";
    if (searchIconEl) searchIconEl.style.color = 'currentColor';
    document.body.classList.remove('gemini-mode-active');
  }
}

// 🎯 Event Listeners
if (geminiToggle) geminiToggle.addEventListener('click', toggleGeminiMode);

if (searchInput) {
  searchInput.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter') {
      const query = searchInput.value.trim();
      if (!query) return;

      if (isGeminiMode) {
        await callGeminiAPI(query);
        searchInput.value = '';
        searchInput.focus();
      } else {
        window.open(`https://www.google.com/search?q=${encodeURIComponent(query)}`, '_self');
      }
    }
  });
}

// 🎹 Global Key Shortcuts
document.addEventListener('keydown', (e) => {
  const target = e.target;
  if (target.tagName !== "INPUT" && target.tagName !== "TEXTAREA" && !target.isContentEditable) {
    if (searchInput) searchInput.focus();
  }

  const isCtrlOrCmd = e.ctrlKey || e.metaKey;
  if (isCtrlOrCmd && e.key.toLowerCase() === 'g') {
    e.preventDefault();
    toggleGeminiMode();
    searchInput.focus();
  }
});
