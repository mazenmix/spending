export async function onRequest(context) {
  const url = new URL(context.request.url);

  if (url.pathname.startsWith('/api/')) return context.next();

  const response = await context.next();
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('text/html')) return response;

  let html = await response.text();

  const uiOverrides = `
<style id="mx-ui-cleanup">
  #todayView .brand,
  #todayView .sub,
  #todayView .stats,
  #todayView .ey,
  #todayView .rate { display:none !important; }
  #todayView .usd { color:var(--green) !important; }
  #todayView .amount-label-row {
    display:flex !important;
    align-items:center;
    justify-content:space-between;
    gap:12px;
    width:100%;
  }
  #amountUsdPreview {
    margin-left:auto;
    color:var(--green);
    font-size:12px;
    font-weight:800;
    white-space:nowrap;
    text-align:right;
  }
</style>`;

  const livePreview = `
<script id="mx-live-usd-preview">
(() => {
  function rateNow() {
    try {
      const saved = JSON.parse(localStorage.getItem('mxs.rate.v1') || '{}');
      const r = Number(saved.rate);
      return r > 0 ? r : 0.017;
    } catch (_) {
      return 0.017;
    }
  }

  function setup() {
    const form = document.getElementById('form');
    const amount = document.getElementById('amount');
    const desc = document.getElementById('desc');
    if (!form || !amount || !desc) return false;

    const labels = form.querySelectorAll('label');
    const amountLabel = labels[0];
    if (!amountLabel) return false;

    amountLabel.classList.add('amount-label-row');

    let preview = document.getElementById('amountUsdPreview');
    if (!preview) {
      preview = document.createElement('span');
      preview.id = 'amountUsdPreview';
      preview.textContent = '';
      amountLabel.appendChild(preview);
    }

    const update = () => {
      const php = Number(String(amount.value || '').replace(/,/g, '').trim());
      preview.textContent = php > 0
        ? '≈ $' + (php * rateNow()).toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2}) + ' USD'
        : '';
    };

    if (!amount.dataset.mxPreviewBound) {
      amount.dataset.mxPreviewBound = '1';
      amount.addEventListener('input', update);
      amount.addEventListener('keyup', update);
      amount.addEventListener('change', update);
    }

    update();
    return true;
  }

  if (!setup()) {
    let tries = 0;
    const timer = setInterval(() => {
      tries++;
      if (setup() || tries > 20) clearInterval(timer);
    }, 150);
  }
})();
</script>`;

  html = html.replace('</head>', uiOverrides + '\n</head>');
  html = html.replace('</body>', livePreview + '\n</body>');

  const headers = new Headers(response.headers);
  headers.delete('content-length');
  headers.set('cache-control', 'no-store, no-cache, must-revalidate, max-age=0');

  return new Response(html, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}
