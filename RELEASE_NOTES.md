# SSR Clean Release (Product + Blog)

Prepared: 2026-02-25

## Included Production Files

- `src/index.js`
- `public/_product_template.tpl`
- `public/js/product/main.js`
- `public/js/product/layout-extra.js`
- `public/js/global-components.js`
- `public/js/payment-selector.js`
- `public/blog/index.html`

## What Is Completed

1. Product page SSR pipeline stabilized step-by-step with no layout break.
2. Product bootstrap expanded to reduce runtime API calls.
3. Checkout button flow fixed for empty payment methods fallback.
4. Blog archive redirect loop fixed (`/blog` and `/blog/` now both 200).
5. Blog archive now server-renders first paint (`data-ssr="1"` + bootstrap payload).
6. Blog detail route remains SSR.
7. Product loading-stuck hardening:
   - init no longer depends on a single DOMContentLoaded race
   - product/settings fetch has guard timeout path
   - non-critical scripts moved after product core for faster first render

## Local Verification Snapshot

- Product checkout open flow: pass (desktop + mobile)
- Fake gateway E2E flow (desktop + mobile): pass
- Blog archive SSR (JS off): pass
- Blog detail SSR: pass

## Live Deploy Checklist

1. Deploy worker/assets from repo root.
2. Verify:
   - `/product-1/birthday-surprise-video`
   - `/checkout`
   - `/blog`
   - `/blog/`
3. Hard refresh once after deploy.

## Live Smoke Tests (Expected)

- `GET /blog` => `200`
- `GET /blog/` => `200`
- Product checkout button opens `/checkout`.
- Blog archive visible even when JS is blocked.

## Notes

- This package only contains changed production files for clean merge/cherry-pick.
- QA evidence is available under `artifacts/product-ssr/testing/`.
