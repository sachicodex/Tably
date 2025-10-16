// JavaScript to hide the loader after the page is fully loaded, with a minimum display time
const startTime = new Date().getTime();

window.addEventListener('load', () => {
  const preloader = document.querySelector('.preloader');
  const mainContent = document.querySelector('.dashboard-container');
  const backgroundLayer = document.querySelector('.background-fade-layer'); // 👈 NEW: Get background layer

  const endTime = new Date().getTime();
  const loadTime = endTime - startTime;
  const minDisplayTime = 1000; // Minimum 1 second display time

  const hideLoader = () => {
    // 1. Add the 'hidden' class to fade the preloader out (0.75s)
    preloader.classList.add('hidden');

    // 2. Trigger the main content's fade-in animation (1s transition)
    mainContent.classList.add('loaded');

    // 3. Trigger the background image fade-in animation (1s transition)
    backgroundLayer.classList.add('loaded');

    // 4. Re-enable scrolling on the body AFTER the preloader has fully faded out (0.75s)
    setTimeout(() => {
      document.body.style.overflow = 'auto';
    }, 750);
  };

  if (loadTime < minDisplayTime) {
    const remainingTime = minDisplayTime - loadTime;
    setTimeout(hideLoader, remainingTime);
  } else {
    hideLoader();
  }
});