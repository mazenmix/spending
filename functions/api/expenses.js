const headers = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store'
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers });
}

const schemas=new WeakMap();
function ensureSchema(db){
  if(!schemas.has(db))schemas.set(db,initializeSchema(db).catch(error=>{schemas.delete(db);throw error}));
  return schemas.get(db);
}
async function initializeSchema(db) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS expenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    amount REAL NOT NULL, description TEXT NOT NULL,
    created_at TEXT NOT NULL, local_date TEXT NOT NULL, client_id TEXT
  )`).run();
  const columns=await db.prepare('PRAGMA table_info(expenses)').all();
  if (!columns.results.some(column=>column.name==='client_id')) {
    try { await db.prepare('ALTER TABLE expenses ADD COLUMN client_id TEXT').run(); }
    catch (error) { if (!/duplicate column/i.test(String(error))) throw error; }
  }
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_expenses_local_date ON expenses(local_date)').run();
  await db.prepare('CREATE UNIQUE INDEX IF NOT EXISTS idx_expenses_client_id ON expenses(client_id)').run();
}

function authorized(request, env) {
  const expected = String(env.MX_SYNC_KEY || '');
  const received = String(request.headers.get('x-mx-sync-key') || '');
  return expected.length >= 6 && received === expected;
}

class InvalidExpense extends Error {}

function normalizeExpense(raw) {
  const amount = Number(raw?.amount);
  const description = String(raw?.description || '').trim().slice(0, 120);
  const createdAt = String(raw?.created_at || new Date().toISOString());
  const localDate = String(raw?.local_date || '').trim();
  const clientId = String(raw?.client_id || crypto.randomUUID()).slice(0, 80);
  if (!Number.isFinite(amount) || amount <= 0) throw new InvalidExpense('Invalid amount');
  if (!description) throw new InvalidExpense('Description is required');
  const calendarDay=new Date(localDate+'T00:00:00Z');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(localDate)||!Number.isFinite(calendarDay.getTime())||
     calendarDay.toISOString().slice(0,10)!==localDate)throw new InvalidExpense('Invalid local date');
  if (Number.isNaN(Date.parse(createdAt))) throw new InvalidExpense('Invalid date/time');
  return { amount, description, createdAt, localDate, clientId };
}

function insertStatement(db,x){
  return db.prepare(`INSERT INTO expenses (amount, description, created_at, local_date, client_id)
    VALUES (?1, ?2, ?3, ?4, ?5) ON CONFLICT(client_id) DO NOTHING`)
    .bind(x.amount,x.description,x.createdAt,x.localDate,x.clientId);
}
function selectStatement(db,x){
  return db.prepare(`SELECT id, amount, description, created_at, local_date, client_id
    FROM expenses WHERE client_id=?1`).bind(x.clientId);
}
export async function onRequest(context) {
  const { request, env } = context;
  if (!env.DB) return json({ ok: false, error: 'D1 binding DB is missing' }, 500);
  if (!authorized(request, env)) return json({ ok: false, error: 'Unauthorized' }, 401);

  try {
    await ensureSchema(env.DB);
    const method = request.method.toUpperCase();

    if (method === 'GET') {
      const query=new URL(request.url).searchParams;
      if(query.get('page')==='1'){
        const before=query.has('before')?Number(query.get('before')):null;
        if(before!==null&&(!Number.isSafeInteger(before)||before<=0))return json({ok:false,error:'Invalid page cursor'},400);
        const columns='SELECT id, amount, description, created_at, local_date, client_id FROM expenses';
        const statement=before===null
          ? env.DB.prepare(columns+' ORDER BY id DESC LIMIT 501')
          : env.DB.prepare(columns+' WHERE id < ?1 ORDER BY id DESC LIMIT 501').bind(before);
        const {results}=await statement.all();
        const expenses=results.slice(0,500);
        return json({ok:true,expenses,next_before:results.length>500?expenses[499].id:null});
      }
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
        if(body.items.length>1000)return json({ok:false,error:'Maximum 1000 expenses per batch'},400);
        const items=body.items.map(normalizeExpense);
        if(!items.length)return json({ok:true,expenses:[]});
        const results=await env.DB.batch(items.flatMap(item=>[insertStatement(env.DB,item),selectStatement(env.DB,item)]));
        return json({ok:true,expenses:items.map((_,index)=>results[2*index+1].results[0])});
      }
      const item=normalizeExpense(body);
      const [,selected]=await env.DB.batch([insertStatement(env.DB,item),selectStatement(env.DB,item)]);
      return json({ok:true,expense:selected.results[0]},201);
    }

    if (method === 'PATCH') {
      const body = await request.json();
      const id = Number(body?.id);
      const amount = Number(body?.amount);
      const description = String(body?.description || '').trim().slice(0, 120);
      if (!Number.isInteger(id) || id <= 0) return json({ ok: false, error: 'Invalid id' }, 400);
      if (!Number.isFinite(amount) || amount <= 0) return json({ ok: false, error: 'Invalid amount' }, 400);
      if (!description) return json({ ok: false, error: 'Description is required' }, 400);
      const expected=body.expected;
      if(expected!==undefined&&(!expected||!Number.isFinite(expected.amount)||typeof expected.description!=='string'))
        return json({ok:false,error:'Invalid edit precondition'},400);
      const update='UPDATE expenses SET amount=?1, description=?2 WHERE id=?3';
      const statement=expected
        ? env.DB.prepare(update+' AND amount=?4 AND description=?5').bind(amount,description,id,expected.amount,expected.description)
        : env.DB.prepare(update).bind(amount,description,id);
      const [,current]=await env.DB.batch([statement,env.DB.prepare(
        'SELECT id, amount, description, created_at, local_date, client_id FROM expenses WHERE id=?1'
      ).bind(id)]);
      const row=current.results[0];
      if(!row)return json({ok:false,error:'Expense no longer exists'},404);
      if(Number(row.amount)!==amount||row.description!==description)
        return json({ok:false,error:'Expense changed elsewhere',current:row},409);
      return json({ ok: true, expense: row });
    }

    if (method === 'DELETE') {
      const url = new URL(request.url);
      if (url.searchParams.get('all') === '1') {
        const body = await request.json().catch(() => null);
        if (body?.confirm !== 'DELETE_ALL') {
          return json({ ok: false, error: 'Explicit deletion confirmation required' }, 400);
        }
        const result = await env.DB.prepare('DELETE FROM expenses').run();
        return json({ ok: true, deleted: result?.meta?.changes || 0 });
      }
      const clientId=url.searchParams.get('client_id');
      const id=Number(url.searchParams.get('id'));
      if(clientId!==null&&(!clientId||clientId.length>80))return json({ok:false,error:'Invalid client ID'},400);
      if(clientId===null&&(!Number.isSafeInteger(id)||id<=0))return json({ok:false,error:'Invalid id'},400);
      const selector=clientId===null?'id=?1':'client_id=?1',key=clientId??id;
      const body=request.headers.get('content-type')?.includes('application/json')?await request.json():null;
      const expected=body?.expected;
      if(expected!==undefined&&(!expected||!Number.isFinite(expected.amount)||typeof expected.description!=='string'))
        return json({ok:false,error:'Invalid delete precondition'},400);
      if(expected||body?.onlyIfAbsent===true){
        const select=env.DB.prepare(
          'SELECT id, amount, description, created_at, local_date, client_id FROM expenses WHERE '+selector
        ).bind(key);
        const current=expected?(await env.DB.batch([
          env.DB.prepare('DELETE FROM expenses WHERE '+selector+' AND amount=?2 AND description=?3').bind(key,expected.amount,expected.description),
          select
        ]))[1].results[0]:await select.first();
        if(current)return json({ok:false,error:'Expense changed elsewhere',current},409);
      }else{
        await env.DB.prepare('DELETE FROM expenses WHERE '+selector).bind(key).run();
      }
      return json({ ok: true });
    }

    return json({ ok: false, error: 'Method not allowed' }, 405);
  } catch (err) {
    return json({ ok: false, error: err?.message || 'Server error' }, err instanceof InvalidExpense || err instanceof SyntaxError ? 400 : 500);
  }
}
