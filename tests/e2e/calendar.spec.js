import { test, expect } from '@playwright/test';
import { Miniflare } from 'miniflare';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';

const scriptPath = path.resolve('src/worker.ts');
const migrationPath = path.resolve('migrations/0001_init.sql');
const publicDir = path.resolve('public');

let server;
let baseURL;
let mf;

function getContentType(filePath) {
  if (filePath.endsWith('.html')) return 'text/html; charset=utf-8';
  if (filePath.endsWith('.css')) return 'text/css; charset=utf-8';
  if (filePath.endsWith('.js')) return 'text/javascript; charset=utf-8';
  return 'application/octet-stream';
}

async function serveStatic(req, res) {
  const url = new URL(req.url, 'http://localhost');
  let pathname = url.pathname === '/' ? '/index.html' : url.pathname;
  const normalized = path.normalize(pathname).replace(/^\.\.(\/|\\)/, '');
  const filePath = path.join(publicDir, normalized);

  try {
    const data = await fs.readFile(filePath);
    res.writeHead(200, { 'Content-Type': getContentType(filePath) });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }
}

async function proxyToWorker(req, res) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = chunks.length ? Buffer.concat(chunks) : undefined;

  const workerRes = await mf.dispatchFetch(`http://localhost${req.url}`, {
    method: req.method,
    headers: req.headers,
    body,
  });

  res.statusCode = workerRes.status;
  workerRes.headers.forEach((value, key) => {
    res.setHeader(key, value);
  });

  const buffer = Buffer.from(await workerRes.arrayBuffer());
  res.end(buffer);
}

async function startServer() {
  mf = new Miniflare({
    modules: true,
    scriptPath,
    d1Databases: {
      DB: 'DB',
    },
  });

  const db = await mf.getD1Database('DB');
  const migration = await fs.readFile(migrationPath, 'utf8');
  await db.exec(migration);

  server = http.createServer(async (req, res) => {
    if (req.url?.startsWith('/api')) {
      await proxyToWorker(req, res);
      return;
    }

    await serveStatic(req, res);
  });

  await new Promise((resolve) => {
    server.listen(0, resolve);
  });

  const address = server.address();
  baseURL = `http://localhost:${address.port}`;
}

test.beforeAll(async () => {
  await startServer();
});

test.afterAll(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  if (mf) await mf.dispose();
});

test('create, edit, and delete an event', async ({ page }) => {
  await page.goto(baseURL);
  await expect(page.locator('#monthLabel')).toBeVisible();

  const dayCell = page.locator('.day').filter({ hasNot: page.locator('.muted') }).first();
  await dayCell.click();

  await page.getByRole('button', { name: '+ 予定' }).click();
  await page.getByLabel('タイトル').fill('テスト予定');
  await page.getByLabel('開始時刻').fill('09:00');
  await page.getByLabel('終了時刻').fill('10:00');
  await page.getByLabel('メモ').fill('Playwright');
  await page.getByRole('button', { name: '保存' }).click();

  await expect(page.getByText('テスト予定')).toBeVisible();

  await page.getByRole('button', { name: '編集' }).first().click();
  await page.getByLabel('タイトル').fill('テスト予定(更新)');
  await page.getByRole('button', { name: '保存' }).click();

  await expect(page.getByText('テスト予定(更新)')).toBeVisible();

  await page.getByRole('button', { name: '編集' }).first().click();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: '削除' }).click();

  await expect(page.getByText('テスト予定(更新)')).not.toBeVisible();
});
