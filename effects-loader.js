(function () {
  const loadScript = (src) => new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve();
      return;
    }

    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = resolve;
    script.onerror = reject;
    document.body.appendChild(script);
  });

  const runWhenIdle = (callback) => {
    const start = () => {
      if ("requestIdleCallback" in window) {
        window.requestIdleCallback(callback, { timeout: 2400 });
      } else {
        window.setTimeout(callback, 1200);
      }
    };

    if (document.readyState === "complete") start();
    else window.addEventListener("load", start, { once: true });
  };

  runWhenIdle(() => {
    const motionOK = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const finePointer = window.matchMedia("(pointer: fine)").matches;
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    const slowConnection = connection && (connection.saveData || /(^2g$|slow-2g)/i.test(connection.effectiveType || ""));

    if (motionOK && finePointer && !slowConnection) {
      window.setTimeout(() => {
        loadScript("splash-cursor.js?v=20260616-lite").catch(() => {});
      }, 1800);
    }

    const roomyScreen = window.matchMedia("(min-width: 768px)").matches;
    if (motionOK && finePointer && roomyScreen && !slowConnection && document.querySelector("[data-hero-3d]")) {
      window.setTimeout(() => {
        loadScript("assets/vendor/three.global.js")
          .then(() => loadScript("hero-3d.js?v=20260616-deferred"))
          .catch(() => {});
      }, 600);
    }
  });
})();
