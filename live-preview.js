(() => {
  'use strict';

  let lastValue = null;
  let lastRate = null;

  function getRate() {
    try {
      const saved = JSON.parse(localStorage.getItem('mxs.rate.v1') || '{}');
      const r = Number(saved.rate);
      return r > 0 ? r : 0.017;
    } catch (_) {
      return 0.017;
    }
  }

  function updatePreview(force = false) {
    const amount = document.getElementById('amount');
    const preview = document.getElementById('amountUsdPreview');
    if (!amount || !preview) return;

    const raw = String(amount.value || '').replace(/,/g, '').trim();
    const php = Number(raw);
    const rate = getRate();

    if (!force && raw === lastValue && rate === lastRate) return;
    lastValue = raw;
    lastRate = rate;

    const usd = Number.isFinite(php) && php > 0 ? php * rate : 0;
    preview.textContent = '≈ $' + usd.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }) + ' USD';
  }

  document.addEventListener('input', (e) => {
    if (e.target && e.target.id === 'amount') updatePreview(true);
  }, true);

  document.addEventListener('keyup', (e) => {
    if (e.target && e.target.id === 'amount') updatePreview(true);
  }, true);

  document.addEventListener('change', (e) => {
    if (e.target && e.target.id === 'amount') updatePreview(true);
  }, true);

  document.addEventListener('submit', (e) => {
    if (e.target && e.target.id === 'form') {
      setTimeout(() => updatePreview(true), 0);
    }
  }, true);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => updatePreview(true), { once: true });
  } else {
    updatePreview(true);
  }

  // Poll as a fallback so the preview still updates even if a browser suppresses an input event.
  setInterval(() => updatePreview(false), 120);
})();
