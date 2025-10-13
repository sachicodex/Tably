function updateDashboard() {
  const now = new Date();
  const hours = now.getHours();
  const minutes = now.getMinutes().toString().padStart(2, '0');
  const greeting = document.getElementById("greeting");
  const timeEl = document.getElementById("time");
  const dateEl = document.getElementById("date");

  // Greeting
  if (greeting) {
    greeting.textContent =
      hours < 12 ? "Good Morning!" :
        hours < 18 ? "Good Afternoon!" :
          "Good Evening!";
  }

  // Time & Date
  if (timeEl) {
    const displayHours = hours % 12 || 12;
    const ampm = hours >= 12 ? 'PM' : 'AM';
    timeEl.textContent = `${displayHours}:${minutes} ${ampm}`;
  }
  if (dateEl) {
    dateEl.textContent = now.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  }
}

setInterval(updateDashboard, 1000);
updateDashboard();

// Search Functionality
const searchInput = document.getElementById("searchInput");
if (searchInput) {
  searchInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      const query = searchInput.value.trim();
      if (query) {
        window.open(`https://www.google.com/search?q=${encodeURIComponent(query)}`, "_self");
      }
    }
  });
}

// Shortcuts
document.querySelectorAll(".action-card").forEach((btn) => {
  btn.addEventListener("click", () => {
    const url = btn.dataset.url;
    if (url) window.open(url, "_self");
  });
});

// Dock Icons
document.querySelectorAll(".dock-icon").forEach((btn) => {
  btn.addEventListener("click", () => {
    const url = btn.dataset.url;
    if (url) window.open(url, "_self");
  });
});

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
