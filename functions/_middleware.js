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
  #todayView .sub { display: none !important; }
  #todayView .stats { display: none !important; }
  #todayView .usd { color: var(--green) !important; }
</style>`;

  html = html.replace('</head>', `${uiOverrides}\n</head>`);

  const headers = new Headers(response.headers);
  headers.delete('content-length');
  headers.set('cache-control', 'no-store');

  return new Response(html, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}
