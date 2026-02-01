export interface Env {
  DB: D1Database;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders,
    },
  });
}

function errorResponse(message: string, status = 400) {
  return jsonResponse({ error: message }, status);
}

function parseId(pathname: string) {
  const parts = pathname.split('/').filter(Boolean);
  return parts.length === 3 ? Number(parts[2]) : null;
}

function parseMonth(query: URLSearchParams) {
  const month = query.get('month');
  if (!month) return null;
  const [year, monthValue] = month.split('-').map(Number);
  if (!year || !monthValue || monthValue < 1 || monthValue > 12) return null;

  const startLocal = new Date(year, monthValue - 1, 1, 0, 0, 0);
  const endLocal = new Date(year, monthValue, 1, 0, 0, 0);

  return {
    start: startLocal.toISOString(),
    end: endLocal.toISOString(),
  };
}

async function handleListEvents(url: URL, env: Env) {
  const range = parseMonth(url.searchParams);
  if (!range) {
    return errorResponse('month=YYYY-MM が必要です');
  }

  const { start, end } = range;
  const result = await env.DB.prepare(
    'SELECT id, title, start_at, end_at, memo, created_at, updated_at FROM events WHERE start_at >= ? AND start_at < ? ORDER BY start_at'
  )
    .bind(start, end)
    .all();

  return jsonResponse({ events: result.results || [] });
}

async function handleCreateEvent(request: Request, env: Env) {
  let body: { title?: string; start_at?: string; end_at?: string; memo?: string };

  try {
    body = await request.json();
  } catch {
    return errorResponse('JSONが不正です');
  }

  const title = body.title?.trim();
  if (!title) return errorResponse('title は必須です');

  const start = new Date(body.start_at || '');
  const end = new Date(body.end_at || '');

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return errorResponse('start_at / end_at が不正です');
  }

  if (end <= start) {
    return errorResponse('end_at は start_at より後にしてください');
  }

  const now = new Date().toISOString();

  const result = await env.DB.prepare(
    'INSERT INTO events (title, start_at, end_at, memo, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
  )
    .bind(title, start.toISOString(), end.toISOString(), body.memo || '', now, now)
    .run();

  return jsonResponse({ id: result.meta.last_row_id });
}

async function handleUpdateEvent(request: Request, env: Env, id: number) {
  let body: { title?: string; start_at?: string; end_at?: string; memo?: string };

  try {
    body = await request.json();
  } catch {
    return errorResponse('JSONが不正です');
  }

  const title = body.title?.trim();
  if (!title) return errorResponse('title は必須です');

  const start = new Date(body.start_at || '');
  const end = new Date(body.end_at || '');

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return errorResponse('start_at / end_at が不正です');
  }

  if (end <= start) {
    return errorResponse('end_at は start_at より後にしてください');
  }

  const now = new Date().toISOString();

  const result = await env.DB.prepare(
    'UPDATE events SET title = ?, start_at = ?, end_at = ?, memo = ?, updated_at = ? WHERE id = ?'
  )
    .bind(title, start.toISOString(), end.toISOString(), body.memo || '', now, id)
    .run();

  if (result.meta.changes === 0) {
    return errorResponse('指定IDが見つかりません', 404);
  }

  return jsonResponse({ ok: true });
}

async function handleDeleteEvent(env: Env, id: number) {
  const result = await env.DB.prepare('DELETE FROM events WHERE id = ?').bind(id).run();

  if (result.meta.changes === 0) {
    return errorResponse('指定IDが見つかりません', 404);
  }

  return jsonResponse({ ok: true });
}

export default {
  async fetch(request: Request, env: Env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    const url = new URL(request.url);
    const pathname = url.pathname;

    if (pathname === '/api/health') {
      return jsonResponse({ ok: true });
    }

    if (pathname === '/api/events' && request.method === 'GET') {
      return handleListEvents(url, env);
    }

    if (pathname === '/api/events' && request.method === 'POST') {
      return handleCreateEvent(request, env);
    }

    if (pathname.startsWith('/api/events/') && request.method === 'PUT') {
      const id = parseId(pathname);
      if (!id) return errorResponse('id が不正です', 400);
      return handleUpdateEvent(request, env, id);
    }

    if (pathname.startsWith('/api/events/') && request.method === 'DELETE') {
      const id = parseId(pathname);
      if (!id) return errorResponse('id が不正です', 400);
      return handleDeleteEvent(env, id);
    }

    return errorResponse('Not Found', 404);
  },
};
