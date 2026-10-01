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
    white-space: nowrap;
    text-align: right;
  }
</style>`;

  html = html.replace(
    '<label>How much did you spend?</label>',
    '<label class="amount-label-row"><span>How much did you spend?</span><span id="amountUsdPreview"></span></label>'
  );

  html = html.replace(
    '<input id="amount" inputmode="decimal" autocomplete="off" placeholder="0">',
    `<input id="amount" inputmode="decimal" autocomplete="off" placeholder="0" oninput="var p=document.getElementById('amountUsdPreview'),v=Number(String(this.value||'').replace(/,/g,'').trim()),r=.017;try{var s=JSON.parse(localStorage.getItem('mxs.rate.v1')||'{}');r=Number(s.rate)>0?Number(s.rate):r}catch(e){}if(p)p.textContent=v>0?'≈ $'+(v*r).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})+' USD':'';">`
  );

  html = html.replace('</head>', `${uiOverrides}\n</head>`);

  const headers = new Headers(response.headers);
  headers.delete('content-length');
  headers.set('cache-control', 'no-store, no-cache, must-revalidate');

  return new Response(html, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}
