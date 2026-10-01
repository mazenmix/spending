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

  const cleanForm = `<form id="form" class="card">
<label class="amount-label-row"><span>How much did you spend?</span><span id="amountUsdPreview">≈ $0.00 USD</span></label>
<div class="field"><i>₱</i><input id="amount" inputmode="decimal" autocomplete="off" placeholder="0"></div>
<label>What was it for?</label>
<div class="field text"><input id="desc" maxlength="120" autocomplete="off" placeholder="e.g. Dinner with friends"></div>
<button id="addBtn" class="add" type="submit">＋ ADD EXPENSE</button>
</form>`;

  html = html.replace(/<form id="form" class="card">[\s\S]*?<\/form>/, cleanForm);
  html = html.replace('</head>', uiOverrides + '\n</head>');
  html = html.replace('</body>', '<script src="/live-preview.js?v=4" defer></script>\n</body>');

  const headers = new Headers(response.headers);
  headers.delete('content-length');
  headers.set('cache-control', 'no-store, no-cache, must-revalidate, max-age=0');

  return new Response(html, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}
