# Deploy Guide (Cloudflare Workers + Pages Assets)

This repo is designed to run as a **Cloudflare Worker** with:
- **D1** (database)
- **R2** (uploads)
- **Static assets** served from `public/` via Wrangler `[assets]`

## 1) Prerequisites

- Node.js 18+
- Cloudflare account
- Wrangler installed (repo already includes it in devDependencies)

```bash
npm install
npx wrangler login
```

## 2) Create Cloudflare resources

### Create D1

```bash
npx wrangler d1 create YOUR_DB_NAME
```

Copy the returned `database_id` and set it in `wrangler.toml` under `[[d1_databases]]`.

### Create R2 buckets

```bash
npx wrangler r2 bucket create YOUR_PRODUCT_MEDIA_BUCKET
npx wrangler r2 bucket create YOUR_TEMP_UPLOADS_BUCKET
```

Update `wrangler.toml` with the bucket names for:
- `PRODUCT_MEDIA`
- `R2_BUCKET`

## 3) Configure `wrangler.toml`

1. Copy `wrangler.toml.example` to `wrangler.toml`
2. Replace all `CHANGE-ME-*` values
3. (Optional) add your custom domain under `routes = [...]`

## 4) Set required secrets

At minimum, set an admin session secret (used for admin auth + some upload bypass flows):

```bash
npx wrangler secret put ADMIN_SESSION_SECRET
```

Optional secrets (only if you use these features):

```bash
# Archive.org uploads
npx wrangler secret put ARCHIVE_ACCESS_KEY
npx wrangler secret put ARCHIVE_SECRET_KEY

# Turnstile captcha for uploads (optional)
npx wrangler secret put TURNSTILE_SECRET_KEY

# Whop integration (optional)
npx wrangler secret put WHOP_API_KEY

# Email notifications (optional: Brevo)
npx wrangler secret put BREVO_API_KEY
npx wrangler secret put BREVO_FROM_EMAIL
npx wrangler secret put BREVO_FROM_NAME
npx wrangler secret put ORDER_ADMIN_EMAIL
```

## 5) Local development

Remote dev (recommended when using D1/R2):

```bash
npm run dev
```

Local dev:

```bash
npm run dev:local
```

## 6) Deploy

```bash
npm run deploy
```

If you want a production environment, add an env section in `wrangler.toml` and run:

```bash
npm run deploy:prod
```

## 7) Notes / gotchas

- Blog featured images are uploaded to R2 via `/api/upload/temp-file` and stored as a URL. This prevents request-size failures during Publish.
- Make sure your R2 buckets exist and are correctly bound, otherwise uploads will fail.
