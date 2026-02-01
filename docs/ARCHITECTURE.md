# Architecture

## 概要
- フロント: Cloudflare Pages（静的サイト）
- バックエンド: Cloudflare Workers + D1 (SQLite)

## 主要コンポーネント
- **UI**: `public/` に静的HTML/CSS/JS
- **API**: `src/worker.ts` がREST APIを提供
- **DB**: D1にイベントを保存

## API
- `GET /api/health` ヘルスチェック
- `GET /api/events?month=YYYY-MM` 月内イベント一覧
- `POST /api/events` 作成
- `PUT /api/events/:id` 更新
- `DELETE /api/events/:id` 削除

## データモデル
- `events`
  - `id` INTEGER PRIMARY KEY
  - `title` TEXT NOT NULL
  - `start_at` TEXT NOT NULL (ISO 8601)
  - `end_at` TEXT NOT NULL (ISO 8601)
  - `memo` TEXT
  - `created_at` TEXT NOT NULL
  - `updated_at` TEXT NOT NULL

## セキュリティ
- 認証なし
- CORSでフロントアクセスを許可

## デプロイ
- Cloudflare Pages: `public/` を公開
- Cloudflare Workers: `wrangler.toml` で設定しD1をバインド
