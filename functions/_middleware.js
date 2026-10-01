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
    justify-content:flex-end;
    width:100%;
    margin-bottom:7px;
  }
  #amountUsdPreview {
    margin-left:auto;
    color:var(--green);
    font-size:20px;
    line-height:1.15;
    font-weight:900;
    letter-spacing:.1px;
    white-space:nowrap;
    text-align:right;
  }
  #mxInstallBanner {
    display:none;
    width:min(calc(100% - 32px),528px);
    margin:12px auto 0;
    border:1px solid rgba(34,170,255,.42);
    background:linear-gradient(135deg,rgba(10,31,48,.98),rgba(5,18,29,.98));
    border-radius:16px;
    padding:11px 12px;
    align-items:center;
    gap:10px;
    box-shadow:0 12px 35px rgba(0,0,0,.34);
  }
  #mxInstallBanner.on { display:flex; }
  #mxInstallBanner .mx-install-icon {
    width:38px;
    height:38px;
    border-radius:11px;
    display:grid;
    place-items:center;
    flex:0 0 38px;
    background:rgba(34,170,255,.12);
    border:1px solid rgba(34,170,255,.25);
    color:var(--blue);
    font-weight:900;
    font-size:17px;
  }
  #mxInstallBanner .mx-install-copy { min-width:0; flex:1; }
  #mxInstallBanner .mx-install-copy b { display:block; font-size:13px; color:#fff; }
  #mxInstallBanner .mx-install-copy span { display:block; margin-top:2px; font-size:10px; color:var(--mut); line-height:1.3; }
  #mxInstallButton {
    border:0;
    border-radius:11px;
    padding:9px 12px;
    background:linear-gradient(90deg,#21b4ff,#0877ff);
    color:#fff;
    font-weight:900;
    font-size:11px;
    white-space:nowrap;
  }
  #mxInstallClose {
    width:28px;
    height:28px;
    border:0;
    background:transparent;
    color:#8196aa;
    font-size:19px;
    line-height:1;
    padding:0;
  }
</style>`;

  const cleanForm = `<form id="form" class="card">
<label class="amount-label-row"><span id="amountUsdPreview">≈ $0.00 USD</span></label>
<div class="field"><i>₱</i><input id="amount" inputmode="decimal" autocomplete="off" placeholder="0"></div>
<div class="field text"><input id="desc" maxlength="120" autocomplete="off" placeholder="e.g. Dinner with friends"></div>
<button id="addBtn" class="add" type="submit">＋ ADD EXPENSE</button>
</form>`;

  const installBanner = `<div id="mxInstallBanner" aria-hidden="true">
<div class="mx-install-icon">MX</div>
<div class="mx-install-copy"><b>Install MX Spend</b><span id="mxInstallHint">Install the app on your phone for faster access</span></div>
<button id="mxInstallButton" type="button">INSTALL</button>
<button id="mxInstallClose" type="button" aria-label="Close">×</button>
</div>`;

  html = html.replace(/<form id="form" class="card">[\s\S]*?<\/form>/, cleanForm);
  html = html.replace('</head>', uiOverrides + '\n</head>');
  html = html.replace('<main class="app">', installBanner + '\n<main class="app">');
  html = html.replace('</body>', '<script src="/live-preview.js?v=4" defer></script>\n<script src="/install-prompt.js?v=1" defer></script>\n</body>');

  const headers = new Headers(response.headers);
  headers.delete('content-length');
  headers.set('cache-control', 'no-store, no-cache, must-revalidate, max-age=0');

  return new Response(html, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}
