(() => {
  'use strict';

  const banner = document.getElementById('mxInstallBanner');
  const button = document.getElementById('mxInstallButton');
  const close = document.getElementById('mxInstallClose');
  const hint = document.getElementById('mxInstallHint');
  if (!banner || !button) return;

  let deferredPrompt = null;
  const installedKey = 'mxs.app.installed.v1';
  const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const isMobile = /android|iphone|ipad|ipod/i.test(navigator.userAgent);

  function markInstalled() {
    try { localStorage.setItem(installedKey, '1'); } catch (_) {}
  }

  function wasMarkedInstalled() {
    try { return localStorage.getItem(installedKey) === '1'; } catch (_) { return false; }
  }

  function hide() {
    banner.classList.remove('on');
    banner.setAttribute('aria-hidden', 'true');
  }

  function show(text) {
    if (isStandalone() || wasMarkedInstalled()) return;
    if (hint && text) hint.textContent = text;
    banner.classList.add('on');
    banner.setAttribute('aria-hidden', 'false');
  }

  if (isStandalone()) {
    markInstalled();
    hide();
    return;
  }

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredPrompt = event;
    show('Install MX Spend on your phone for faster access');
  });

  window.addEventListener('appinstalled', () => {
    markInstalled();
    deferredPrompt = null;
    hide();
  });

  button.addEventListener('click', async () => {
    if (deferredPrompt) {
      const prompt = deferredPrompt;
      deferredPrompt = null;
      await prompt.prompt();
      try {
        const choice = await prompt.userChoice;
        if (choice && choice.outcome === 'accepted') {
          markInstalled();
          hide();
        }
      } catch (_) {}
      return;
    }

    if (isIOS) {
      alert('To install MX Spend: tap the Share button in Safari, then choose “Add to Home Screen”, then tap Add.');
      return;
    }

    alert('Open your browser menu and choose “Install app” or “Add to Home screen”.');
  });

  if (close) close.addEventListener('click', hide);

  // iPhone/iPad Safari does not fire beforeinstallprompt, so show our own install notice.
  if (isIOS && !wasMarkedInstalled()) {
    show('Add MX Spend to your Home Screen');
  }

  // Fallback for mobile browsers that delay or do not expose beforeinstallprompt.
  if (isMobile && !isIOS && !wasMarkedInstalled()) {
    setTimeout(() => {
      if (!isStandalone() && !banner.classList.contains('on')) {
        show('Install MX Spend on your phone for faster access');
      }
    }, 1800);
  }
})();