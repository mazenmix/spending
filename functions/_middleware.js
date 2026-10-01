export async function onRequest(context) {
  const url = new URL(context.request.url);

  if (url.pathname.startsWith('/api/')) {
    return context.next();
  }

  const response = await context.next();
  const contentType = response.headers.get('content-type') || '';

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
  #todayView .amount-label-row {
    display: flex !important;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    width: 100%;
  }
  #amountUsdPreview {
    margin-left: auto;
    color: var(--green);
    font-size: 12px;
    font-weight: 800;
    letter-spacing: .1px;
    white-space: nowrap;
    text-align: right;
  }
</style>`;

  // Put the USD preview directly in the HTML beside the amount label.
  html = html.replace(
    '<label>How much did you spend?</label>',
    '<label class="amount-label-row"><span>How much did you spend?</span><span id="amountUsdPreview"></span></label>'
  );

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
    let preview = document.getElementById('amountUsdPreview');
    if (!amount) return;

    // Fallback for older cached HTML.
    if (!preview) {
      const field = amount.closest('.field');
      const label = field && field.previousElementSibling;
      if (!label || label.tagName !== 'LABEL') return;
      label.classList.add('amount-label-row');
      const text = label.textContent.trim();
      label.textContent = '';
      const title = document.createElement('span');
      title.textContent = text || 'How much did you spend?';
      preview = document.createElement('span');
      preview.id = 'amountUsdPreview';
      label.append(title, preview);
    }

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

    amount.addEventListener('input', update);
    amount.addEventListener('keyup', update);
    amount.addEventListener('change', update);
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
  headers.set('cache-control', 'no-store, max-age=0');

  return new Response(html, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}
