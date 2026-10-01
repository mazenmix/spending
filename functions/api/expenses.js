const headers = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store'
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers });
}

async function ensureSchema(db) {
  try { await db.prepare('ALTER TABLE expenses ADD COLUMN client_id TEXT').run(); } catch (_) {}
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_expenses_local_date ON expenses(local_date)').run();
  await db.prepare('CREATE UNIQUE INDEX IF NOT EXISTS idx_expenses_client_id ON expenses(client_id)').run();
}

function authorized(request, env) {
  const expected = String(env.MX_SYNC_KEY || '');
  const received = String(request.headers.get('x-mx-sync-key') || '');
  return expected.length >= 6 && received === expected;
}

function normalizeExpense(raw) {
  const amount = Number(raw?.amount);
  const description = String(raw?.description || '').trim().slice(0, 120);
  const createdAt = String(raw?.created_at || new Date().toISOString());
  const localDate = String(raw?.local_date || '').trim();
  const clientId = String(raw?.client_id || crypto.randomUUID()).slice(0, 80);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('Invalid amount');
  if (!description) throw new Error('Description is required');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(localDate)) throw new Error('Invalid local date');
  if (Number.isNaN(Date.parse(createdAt))) throw new Error('Invalid date/time');
  return { amount, description, createdAt, localDate, clientId };
}

async function insertOne(db, raw) {
  const x = normalizeExpense(raw);
  await db.prepare(`
    INSERT OR IGNORE INTO expenses (amount, description, created_at, local_date, client_id)
    VALUES (?1, ?2, ?3, ?4, ?5)
  `).bind(x.amount, x.description, x.createdAt, x.localDate, x.clientId).run();
  const row = await db.prepare(`
    SELECT id, amount, description, created_at, local_date, client_id
    FROM expenses WHERE client_id = ?1
  `).bind(x.clientId).first();
  return row;
}

export async function onRequest(context) {
  const { request, env } = context;
  if (!env.DB) return json({ ok: false, error: 'D1 binding DB is missing' }, 500);
  if (!authorized(request, env)) return json({ ok: false, error: 'Unauthorized' }, 401);

  try {
    await ensureSchema(env.DB);
    const method = request.method.toUpperCase();

    if (method === 'GET') {
      const { results } = await env.DB.prepare(`
        SELECT id, amount, description, created_at, local_date, client_id
        FROM expenses
        ORDER BY created_at DESC, id DESC
        LIMIT 20000
      `).all();
      return json({ ok: true, expenses: results || [] });
    }

    if (method === 'POST') {
      const body = await request.json();
      if (Array.isArray(body?.items)) {
        const inserted = [];
        for (const item of body.items.slice(0, 1000)) inserted.push(await insertOne(env.DB, item));
        return json({ ok: true, expenses: inserted.filter(Boolean) });
      }
      const row = await insertOne(env.DB, body);
      return json({ ok: true, expense: row }, 201);
    }

    if (method === 'PATCH') {
      const body = await request.json();
      const id = Number(body?.id);
      const amount = Number(body?.amount);
      const description = String(body?.description || '').trim().slice(0, 120);
      if (!Number.isInteger(id) || id <= 0) return json({ ok: false, error: 'Invalid id' }, 400);
      if (!Number.isFinite(amount) || amount <= 0) return json({ ok: false, error: 'Invalid amount' }, 400);
      if (!description) return json({ ok: false, error: 'Description is required' }, 400);
      await env.DB.prepare('UPDATE expenses SET amount=?1, description=?2 WHERE id=?3')
        .bind(amount, description, id).run();
      const row = await env.DB.prepare(`
        SELECT id, amount, description, created_at, local_date, client_id
        FROM expenses WHERE id=?1
      `).bind(id).first();
      return json({ ok: true, expense: row });
    }

    if (method === 'DELETE') {
      const url = new URL(request.url);
      const id = Number(url.searchParams.get('id'));
      if (!Number.isInteger(id) || id <= 0) return json({ ok: false, error: 'Invalid id' }, 400);
      await env.DB.prepare('DELETE FROM expenses WHERE id=?1').bind(id).run();
      return json({ ok: true });
    }

    return json({ ok: false, error: 'Method not allowed' }, 405);
  } catch (err) {
    return json({ ok: false, error: err?.message || 'Server error' }, 500);
  }
}
