import { describe, it, beforeEach, expect } from 'vitest';
import worker from '../src/worker.ts';

function createMockDb() {
  let nextId = 1;
  const events = [];

  function toDate(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function listByRange(startIso, endIso) {
    const start = toDate(startIso);
    const end = toDate(endIso);
    return events
      .filter((event) => {
        const eventDate = toDate(event.start_at);
        return eventDate && start && end && eventDate >= start && eventDate < end;
      })
      .sort((a, b) => new Date(a.start_at) - new Date(b.start_at));
  }

  return {
    prepare(sql) {
      let bound = [];
      return {
        bind(...params) {
          bound = params;
          return this;
        },
        async all() {
          if (sql.startsWith('SELECT')) {
            const [start, end] = bound;
            return { results: listByRange(start, end) };
          }
          throw new Error(`Unexpected SQL for all(): ${sql}`);
        },
        async run() {
          if (sql.startsWith('INSERT INTO events')) {
            const [title, start_at, end_at, memo, created_at, updated_at] = bound;
            const id = nextId++;
            events.push({ id, title, start_at, end_at, memo, created_at, updated_at });
            return { meta: { last_row_id: id, changes: 1 } };
          }

          if (sql.startsWith('UPDATE events')) {
            const [title, start_at, end_at, memo, updated_at, id] = bound;
            const target = events.find((event) => event.id === id);
            if (!target) return { meta: { changes: 0 } };
            Object.assign(target, { title, start_at, end_at, memo, updated_at });
            return { meta: { changes: 1 } };
          }

          if (sql.startsWith('DELETE FROM events')) {
            const [id] = bound;
            const index = events.findIndex((event) => event.id === id);
            if (index === -1) return { meta: { changes: 0 } };
            events.splice(index, 1);
            return { meta: { changes: 1 } };
          }

          throw new Error(`Unexpected SQL for run(): ${sql}`);
        },
      };
    },
  };
}

async function json(res) {
  const text = await res.text();
  return text ? JSON.parse(text) : {};
}

describe('API events', () => {
  let mf;

  beforeEach(async () => {
    mf = { env: { DB: createMockDb() } };
  });

  it('creates and lists events', async () => {
    const createRes = await worker.fetch(
      new Request('http://localhost/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Focus',
        start_at: '2026-02-02T09:00:00.000Z',
        end_at: '2026-02-02T10:00:00.000Z',
        memo: 'Deep work',
      }),
    }),
      mf.env
    );

    expect(createRes.status).toBe(200);
    const created = await json(createRes);
    expect(created.id).toBeTruthy();

    const listRes = await worker.fetch(
      new Request('http://localhost/api/events?month=2026-02'),
      mf.env
    );
    const list = await json(listRes);
    expect(list.events.length).toBe(1);
    expect(list.events[0].title).toBe('Focus');
  });

  it('updates and deletes events', async () => {
    const createRes = await worker.fetch(
      new Request('http://localhost/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Morning',
        start_at: '2026-02-03T08:00:00.000Z',
        end_at: '2026-02-03T09:00:00.000Z',
        memo: '',
      }),
    }),
      mf.env
    );

    const created = await json(createRes);
    const id = created.id;

    const updateRes = await worker.fetch(
      new Request(`http://localhost/api/events/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Morning updated',
        start_at: '2026-02-03T08:30:00.000Z',
        end_at: '2026-02-03T09:30:00.000Z',
        memo: 'Updated',
      }),
    }),
      mf.env
    );

    expect(updateRes.status).toBe(200);

    const deleteRes = await worker.fetch(
      new Request(`http://localhost/api/events/${id}`, { method: 'DELETE' }),
      mf.env
    );

    expect(deleteRes.status).toBe(200);
  });

  it('validates payload', async () => {
    const res = await worker.fetch(
      new Request('http://localhost/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: '',
        start_at: 'invalid',
        end_at: 'invalid',
      }),
    }),
      mf.env
    );

    expect(res.status).toBe(400);
  });
});
