export async function onRequest(context) {
  const url = new URL(context.request.url);

  // Never interfere with API routes.
  if (url.pathname.startsWith('/api/')) {
    return context.next();
  }

  const response = await context.next();
  const contentType = response.headers.get('content-type') || '';

  // Only adjust rendered HTML pages.
  if (!contentType.includes('text/html')) {
    return response;
  }

  let html = await response.text();
  const uiOverrides = `
<style id="mx-ui-cleanup">
  #todayView .brand { display: none !important; }
  #todayView .sub { display: none !important; }
  #todayView .stats { display: none !important; }
  #todayView .ey { display: none !important; }
  #todayView .rate { display: none !important; }
  #todayView .usd { color: var(--green) !important; }
  #amountUsdPreview {
    margin: -5px 4px 12px;
    min-height: 16px;
    color: var(--green);
    font-size: 12px;
    font-weight: 750;
    letter-spacing: .1px;
  }
</style>`;

  const livePreview = `
<script id="mx-live-usd-preview">
(() => {
  function getRate() {
    try {
      const saved = JSON.parse(localStorage.getItem('mxs.rate.v1') || '{}');
      const r = Number(saved.rate);
      return r > 0 ? r : 0.017;
    } catch {
      return 0.017;
    }
  }

  function initPreview() {
    const amount = document.getElementById('amount');
    if (!amount || document.getElementById('amountUsdPreview')) return;

    const field = amount.closest('.field');
    if (!field) return;

    const preview = document.createElement('div');
    preview.id = 'amountUsdPreview';
    preview.textContent = '';
    field.insertAdjacentElement('afterend', preview);

    const update = () => {
      const php = Number(String(amount.value || '').replace(/,/g, '').trim());
      if (!(php > 0)) {
        preview.textContent = '';
        return;
      }
      preview.textContent = '≈ $' + (php * getRate()).toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }) + ' USD';
    };

    amount.addEventListener('input', update, { passive: true });
    amount.addEventListener('change', update, { passive: true });
    update();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPreview, { once: true });
  } else {
    initPreview();
  }
})();
</script>`;

  html = html.replace('</head>', `${uiOverrides}\n</head>`);
  html = html.replace('</body>', `${livePreview}\n</body>`);

  const headers = new Headers(response.headers);
  headers.delete('content-length');
  headers.set('cache-control', 'no-store');

  return new Response(html, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}
