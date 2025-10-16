// --- JavaScript Logic ---

// Global state for Gemini Mode
let isGeminiMode = false;

// --- Utility Function for API Calls (with backoff) ---
const exponentialBackoff = async (fn, maxRetries = 5, delay = 1000) => {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      // Only log and retry on specific network/rate limit errors, but here we just retry generic errors
      if (i === maxRetries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, i)));
    }
  }
};


// --- DOM Elements and Constants ---
const searchInput = document.getElementById("searchInput");
const geminiToggle = document.getElementById("geminiModeToggle");
const geminiQaSection = document.getElementById("geminiQaSection");
const geminiResultsEl = document.getElementById("geminiResults");
const loadingSpinner = document.getElementById("loadingSpinner");
const searchIconEl = document.querySelector('.search-icon');

const apiKey = "AIzaSyBOONNHz9MLRyFyNE4u82JhAiD1svmOp3s"; // Canvas environment provides the key
const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;


// --- Gemini Q&A Logic ---

// Function to display results
function displayResults(text, sources = []) {
  // Basic Markdown to HTML conversion for visibility (e.g., bold and newlines)
  let htmlContent = text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br>');

  geminiResultsEl.innerHTML = htmlContent;

  // Add Sources
  if (sources.length > 0) {
    let sourcesHtml = '<div class="mt-4 pt-3 border-t border-white/20">';
    sourcesHtml += '<p class="text-sm font-semibold opacity-80 mb-1">Sources:</p>';
    sources.forEach((source, index) => {
      sourcesHtml += `<a href="${source.uri}" target="_blank" class="citation-source" title="${source.title}">${index + 1}. ${source.title}</a>`;
    });
    sourcesHtml += '</div>';
    geminiResultsEl.innerHTML += sourcesHtml;
  }
}

// Function to call Gemini API
async function callGeminiAPI(query) {
  if (!query) return;

  // 1. Show Loading State
  geminiResultsEl.innerHTML = '';
  loadingSpinner.classList.remove('hidden');
  geminiQaSection.classList.remove('hidden');

  const systemPrompt = "You are a concise and helpful AI assistant embedded in a new tab dashboard. Answer the user's query directly and briefly, citing sources where applicable. Respond in markdown format.";

  const payload = {
    contents: [{ parts: [{ text: query }] }],
    // Enable Google Search for up-to-date and grounded information
    tools: [{ "google_search": {} }],
    systemInstruction: {
      parts: [{ text: systemPrompt }]
    },
  };

  let response;
  try {
    response = await exponentialBackoff(() => fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }));

    if (!response.ok) {
      // Try to parse error body if possible
      let errorBody = await response.text();
      throw new Error(`API call failed with status: ${response.status}. Body: ${errorBody.substring(0, 100)}`);
    }

    const result = await response.json();
    const candidate = result.candidates?.[0];

    let generatedText = "I couldn't generate a response for that query. Check the console for API details.";
    let sources = [];

    if (candidate && candidate.content?.parts?.[0]?.text) {
      generatedText = candidate.content.parts[0].text;

      const groundingMetadata = candidate.groundingMetadata;
      if (groundingMetadata && groundingMetadata.groundingAttributions) {
        sources = groundingMetadata.groundingAttributions
          .map(attribution => ({
            uri: attribution.web?.uri,
            title: attribution.web?.title,
          }))
          .filter(source => source.uri && source.title);
      }
    }

    displayResults(generatedText, sources);

  } catch (error) {
    console.error("Gemini API Error:", error);
    displayResults("Sorry, an error occurred while connecting to the AI service. Please try again later.");
  } finally {
    // 2. Hide Loading State
    loadingSpinner.classList.add('hidden');
  }
}

// Function to handle the Gemini toggle button
function toggleGeminiMode() {
  isGeminiMode = !isGeminiMode;
  geminiToggle.classList.toggle("gemini-active", isGeminiMode);

  // Clear old results/loading state on mode switch
  geminiQaSection.classList.add('hidden');
  geminiResultsEl.innerHTML = '';
  loadingSpinner.classList.add('hidden');

  if (isGeminiMode) {
    searchInput.placeholder = "Ask Gemini anything...";
    searchIconEl.style.color = '#4285f4'; // Highlight search icon
  } else {
    searchInput.placeholder = "Search the web...";
    searchIconEl.style.color = 'currentColor'; // Reset search icon color
  }
}

// --- Event Listeners ---

// 1. Gemini Mode Toggle
geminiToggle.addEventListener("click", toggleGeminiMode);


// 2. Search Handler (Modified for Gemini Mode)
if (searchInput) {
  searchInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      const query = searchInput.value.trim();
      if (query) {
        if (isGeminiMode) {
          callGeminiAPI(query);
        } else {
          // Original Google Search behavior
          window.open(`https://www.google.com/search?q=${encodeURIComponent(query)}`, "_self");
        }
      }
    }
  });
}

// 3. Focus Search on Key Press
document.addEventListener("keydown", (e) => {
  const target = e.target;
  if (
    target.tagName !== "INPUT" &&
    target.tagName !== "TEXTAREA" &&
    !target.isContentEditable
  ) {
    const searchInput = document.getElementById("searchInput");
    if (searchInput) {
      searchInput.focus();
    }
  }
});