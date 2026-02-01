# web-calendar

## Overview
個人学習用のWebカレンダー。Cloudflare Pages + Workers + D1で動かす前提。

## Structure
- `public/` 静的フロントエンド（HTML/CSS/JS）
- `src/worker.ts` API（Workers）
- `migrations/` D1マイグレーション
- `docs/` PRD/SRS/設計

## Local Setup
1. 依存インストール
   - `npm install`
2. D1作成とマイグレーション
   - `npx wrangler d1 create web-calendar`
   - 作成された `database_id` を `wrangler.toml` に設定
   - `npx wrangler d1 migrations apply web-calendar --local`
3. API起動
   - `npm run dev:api`
4. フロント
   - `public/index.html` を開く（APIは `http://localhost:8787` 想定）

## Deploy
- **API**: `npm run deploy:api`
- **Frontend**: Cloudflare Pagesで `public/` を公開

## Tests
- 単体テスト: `npm run test:unit`
- 機能テスト(Playwright): `npm run test:e2e`
- 初回のみ `npx playwright install` が必要

## Notes
- APIのベースURLを変えたい場合は `public/app.js` の `API_BASE` を変更。
