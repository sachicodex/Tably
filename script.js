// script.js
// -----------------------------
// Gemini Chat Renderer (updated)
// -----------------------------

// global state
let isGeminiMode = false;

// utility: exponential backoff for API calls
const exponentialBackoff = async (fn, maxRetries = 5, delay = 1000) => {
  for (let i = 0; i < maxRetries; i++) {
    try { return await fn(); }
    catch (err) {
      if (i === maxRetries - 1) throw err;
      await new Promise(r => setTimeout(r, delay * Math.pow(2, i)));
    }
  }
};

// DOM refs
const searchInput = document.getElementById("searchInput");
const geminiToggle = document.getElementById("geminiModeToggle");
const geminiQaSection = document.getElementById("geminiQaSection");
const geminiResultsEl = document.getElementById("geminiResults");
const aiLoadingIndicator = document.getElementById("aiLoadingIndicator");
const geminiContent = document.getElementById("geminiContent");
const searchIconEl = document.querySelector('.search-icon');

// === CONFIG: put your API key here (or keep using environment) ===
const apiKey = "AIzaSyBOONNHz9MLRyFyNE4u82JhAiD1svmOp3s"; // <-- replace with your key if needed
const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;

// -----------------------------
// Helper: Decode HTML entities like &lt; &gt; &amp;
// Some APIs return markdown but escape < > which breaks tables.
// -----------------------------
function decodeHtmlEntities(text) {
  if (!text || typeof text !== 'string') return text;
  // Create a temporary textarea to decode HTML entities reliably
  const txt = document.createElement('textarea');
  txt.innerHTML = text;
  return txt.value;
}

// -----------------------------
// displayResults: render Markdown -> HTML and highlight code
// -----------------------------
function displayResults(text, sources = []) {
  // Hide loading indicator and show content
  aiLoadingIndicator.classList.add('hidden');
  geminiContent.classList.remove('hidden');

  // 1) if libraries missing, fallback to plain text
  if (typeof marked === 'undefined' || typeof hljs === 'undefined') {
    geminiContent.textContent = text;
    // append sources (if any)
    if (sources.length) {
      const sdiv = document.createElement('div');
      sdiv.className = 'mt-4 pt-3 border-t border-white/20';
      sdiv.innerHTML = '<p class="text-sm font-semibold opacity-80 mb-1">Sources:</p>';
      sources.forEach((s, i) => {
        const a = document.createElement('a');
        a.href = s.uri || '#';
        a.target = '_blank';
        a.className = 'citation-source';
        a.textContent = `${i + 1}. ${s.title || s.uri || 'source'}`;
        sdiv.appendChild(a);
      });
      geminiContent.appendChild(sdiv);
    }
    return;
  }

  // 2) decode entities (helps when API returns HTML-escaped markdown)
  const decoded = decodeHtmlEntities(text);

  // 3) configure marked to allow GitHub-flavored markdown tables and code highlighting
  marked.setOptions({
    breaks: true,
    gfm: true,
    smartLists: true,
    smartypants: false,
    highlight: (code, lang) => {
      // Use highlight.js - attempt language, fallback to auto
      try {
        if (lang && hljs.getLanguage(lang)) {
          return hljs.highlight(code, { language: lang }).value;
        } else {
          return hljs.highlightAuto(code).value;
        }
      } catch (e) {
        return hljs.highlightAuto(code).value;
      }
    }
  });

  // 4) parse markdown -> html
  let htmlContent;
  try {
    htmlContent = marked.parse(decoded);
  } catch (e) {
    // in rare parse failures, show raw decoded text
    htmlContent = `<pre>${escapeHtml(decoded)}</pre>`;
  }

  // 5) insert into DOM
  geminiContent.innerHTML = htmlContent;

  // 6) ensure highlight.js runs on inserted blocks
  try {
    if (typeof hljs.highlightAll === 'function') {
      hljs.highlightAll();
    } else {
      // older hljs API fallback
      document.querySelectorAll('pre code').forEach((block) => {
        hljs.highlightElement(block);
      });
    }
  } catch (e) {
    // fail silently
    console.warn("Highlight.js error:", e);
  }

  // 7) append sources area if present
  if (sources && sources.length > 0) {
    let sourcesHtml = `<div class="mt-4 pt-3 border-t border-white/20"><p class="text-sm font-semibold opacity-80 mb-1">Sources:</p>`;
    sources.forEach((s, i) => {
      const safeUri = s.uri ? s.uri : '#';
      const safeTitle = s.title ? s.title : s.uri || 'Source';
      sourcesHtml += `<a href="${safeUri}" target="_blank" class="citation-source">${i + 1}. ${escapeHtml(safeTitle)}</a>`;
    });
    sourcesHtml += `</div>`;
    geminiContent.insertAdjacentHTML('beforeend', sourcesHtml);
  }
}

// small helper to escape html (used when needed)
function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// -----------------------------
// API call (Gemini)
// -----------------------------
async function callGeminiAPI(query) {
  if (!query) return;

  // show UI with loading state
  geminiQaSection.classList.remove('hidden');
  aiLoadingIndicator.classList.remove('hidden');
  geminiContent.classList.add('hidden');
  geminiContent.innerHTML = '';

  // Add some AI thinking messages for better UX
  const thinkingMessages = [
    "Analyzing your question...",
    "Processing information...",
    "Generating response...",
    "Thinking deeply...",
    "Connecting ideas...",
    "Formulating answer..."
  ];

  const randomMessage = thinkingMessages[Math.floor(Math.random() * thinkingMessages.length)];
  const typingText = document.querySelector('.typing-text');
  if (typingText) {
    typingText.textContent = randomMessage;
  }

  const systemPrompt = `
You are a smart and friendly assistant built for a dashboard called Nova Studio. 
You ALWAYS respond using full GitHub-style Markdown formatting.
Use:
- # Heading 1, ## Heading 2, ### Heading 3 for section titles
- **bold**, *italic*, and ***bold italic***
- Bullet and numbered lists
- Tables using | and --- syntax
- Code blocks wrapped in triple backticks with language name
- Quotes with >
- Paragraph spacing and line breaks

When users ask for text, make it well-formatted, visually clear, and neatly structured.
Keep responses concise and stylish.
If you give code, include syntax highlighting using Markdown.
`;


  const userPrompt = `
You are responding to: "${query}"

Make sure your response is:
- Clearly formatted with headings, bold, and lists
- Easy to scan visually (don’t write one long paragraph)
- Friendly and direct in tone
- If explaining, use step-by-step style or bullet points
- If showing examples, use Markdown code blocks or tables
`;

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

    if (!response.ok) {
      const txt = await response.text();
      throw new Error(`Status ${response.status} - ${txt.substring(0, 200)}`);
    }

    const result = await response.json();
    const candidate = result?.candidates?.[0];
    let generatedText = candidate?.content?.parts?.[0]?.text ?? "No answer generated.";
    // decode or clean text just in case
    generatedText = String(generatedText);

    // Gather sources if available
    let sources = [];
    try {
      const grounding = candidate?.groundingMetadata;
      if (grounding?.groundingAttributions) {
        sources = grounding.groundingAttributions.map(at => ({
          uri: at.web?.uri,
          title: at.web?.title
        })).filter(s => s.uri || s.title);
      }
    } catch (e) {
      sources = [];
    }

    displayResults(generatedText, sources);
  } catch (err) {
    console.error("Gemini API error:", err);
    displayResults("⚠️ Sorry — couldn't connect to the AI service. Please try again later.");
  }
}

// -----------------------------
// Gemini mode toggle
// -----------------------------
function toggleGeminiMode() {
  isGeminiMode = !isGeminiMode;
  geminiToggle.classList.toggle("gemini-active", isGeminiMode);

  // reset UI for safety
  geminiQaSection.classList.add('hidden');
  geminiContent.innerHTML = '';
  aiLoadingIndicator.classList.add('hidden');
  geminiContent.classList.remove('hidden');

  if (isGeminiMode) {
    searchInput.placeholder = "Ask Gemini anything...";
    if (searchIconEl) searchIconEl.style.color = '#4285f4';
    document.body.classList.add('gemini-mode-active');
  } else {
    searchInput.placeholder = "Search the web...";
    if (searchIconEl) searchIconEl.style.color = 'currentColor';
    document.body.classList.remove('gemini-mode-active');
  }
}

// -----------------------------
// Event listeners
// -----------------------------
if (geminiToggle) geminiToggle.addEventListener('click', toggleGeminiMode);

// key handler for Enter -> search or Gemini call
if (searchInput) {
  searchInput.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter') {
      const query = searchInput.value.trim();
      if (!query) return;

      if (isGeminiMode) {
        // call Gemini
        await callGeminiAPI(query);

        // clear input as requested and keep focus
        searchInput.value = '';
        searchInput.focus();
      } else {
        // normal google search
        window.open(`https://www.google.com/search?q=${encodeURIComponent(query)}`, '_self');
      }
    }
  });
}

// focus search on global keypress (keep existing behavior)
document.addEventListener('keydown', (e) => {
  const target = e.target;
  if (target.tagName !== "INPUT" && target.tagName !== "TEXTAREA" && !target.isContentEditable) {
    if (searchInput) searchInput.focus();
  }
});


// -----------------------------
// Global Keyboard Shortcut for AI Mode
// -----------------------------
document.addEventListener('keydown', (e) => {
  // Check for Ctrl+G (Windows/Linux) or Cmd+G (Mac)
  const isCtrlOrCmd = e.ctrlKey || e.metaKey; // e.metaKey is for Cmd on Mac

  if (isCtrlOrCmd && e.key === 'g') {
    // 1. Prevent the default browser action (like opening a new window)
    e.preventDefault();

    // 2. Toggle the Gemini mode
    toggleGeminiMode();

    // 3. Keep the focus on the search input for immediate typing
    if (searchInput) {
      searchInput.focus();
    }
  }
});