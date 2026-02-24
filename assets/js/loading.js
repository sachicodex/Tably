// JavaScript to hide the loader after the page is fully loaded, with a minimum display time
const startTime = new Date().getTime();

window.addEventListener('load', () => {
  const preloader = document.querySelector('.preloader');
  const mainContent = document.querySelector('.dashboard-container');

  const endTime = new Date().getTime();
  const loadTime = endTime - startTime;
  const minDisplayTime = 1000; // Minimum 1 second display time

  const hideLoader = () => {
    if (preloader) preloader.classList.add('hidden');
    if (mainContent) mainContent.classList.add('loaded');

    // Re-enable scrolling on the body after preloader fade.
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
