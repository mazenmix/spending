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

  // Rebuild the expense form server-side so the two fields can never merge.
  const cleanForm = `<form id="form" class="card">
<label class="amount-label-row"><span>How much did you spend?</span><span id="amountUsdPreview">≈ $0.00 USD</span></label>
<div class="field"><i>₱</i><input id="amount" inputmode="decimal" autocomplete="off" placeholder="0"></div>
<label>What was it for?</label>
<div class="field text"><input id="desc" maxlength="120" autocomplete="off" placeholder="e.g. Dinner with friends"></div>
<button id="addBtn" class="add" type="submit">＋ ADD EXPENSE</button>
</form>`;

  html = html.replace(/<form id="form" class="card">[\s\S]*?<\/form>/, cleanForm);

  const livePreview = `
<script id="mx-live-usd-preview">
(() => {
  const rateNow = () => {
    try {
      const saved = JSON.parse(localStorage.getItem('mxs.rate.v1') || '{}');
      const r = Number(saved.rate);
      return r > 0 ? r : 0.017;
    } catch (_) {
      return 0.017;
    }
  };

  const updateUsdPreview = () => {
    const amount = document.getElementById('amount');
    const preview = document.getElementById('amountUsdPreview');
    if (!amount || !preview) return;
    const php = Number(String(amount.value || '').replace(/,/g, '').trim());
    const usd = php > 0 ? php * rateNow() : 0;
    preview.textContent = '≈ $' + usd.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }) + ' USD';
  };

  document.addEventListener('input', (event) => {
    if (event.target && event.target.id === 'amount') updateUsdPreview();
  });
  document.addEventListener('change', (event) => {
    if (event.target && event.target.id === 'amount') updateUsdPreview();
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', updateUsdPreview, { once:true });
  } else {
    updateUsdPreview();
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
