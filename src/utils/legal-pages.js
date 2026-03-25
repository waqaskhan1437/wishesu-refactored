export function renderTermsFallbackPageHtml() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Terms of Service</title>
  <meta name="description" content="Read the Terms of Service for using Prankwish.">
  <link rel="stylesheet" href="/css/style.css">
  <style>
    body { margin: 0; background: #f8fafc; color: #111827; font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
    .legal-shell { max-width: 960px; margin: 0 auto; padding: 56px 20px 80px; }
    .legal-card { background: #ffffff; border-radius: 20px; box-shadow: 0 10px 35px rgba(15, 23, 42, 0.08); padding: 36px 28px; }
    .legal-kicker { display: inline-flex; align-items: center; gap: 8px; padding: 6px 12px; background: #eef2ff; color: #4338ca; border-radius: 999px; font-size: 0.9rem; font-weight: 700; }
    h1 { font-size: clamp(2rem, 5vw, 3rem); line-height: 1.1; margin: 18px 0 12px; color: #0f172a; }
    h2 { font-size: 1.25rem; margin: 28px 0 10px; color: #0f172a; }
    p, li { font-size: 1rem; line-height: 1.75; color: #475569; }
    ul { padding-left: 20px; }
    .legal-actions { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 28px; }
    .legal-actions a { display: inline-flex; align-items: center; justify-content: center; min-height: 44px; padding: 0 18px; border-radius: 999px; text-decoration: none; font-weight: 700; }
    .legal-actions .primary { background: #4f46e5; color: #ffffff; }
    .legal-actions .secondary { background: #e2e8f0; color: #0f172a; }
  </style>
</head>
<body>
  <main class="legal-shell">
    <article class="legal-card">
      <span class="legal-kicker">Legal</span>
      <h1>Terms of Service</h1>
      <p>These terms explain how visitors may use Prankwish, place orders, and interact with personalized video products and related services.</p>

      <h2>Use of the Website</h2>
      <p>By using this website, you agree to use it lawfully, provide accurate information during checkout or support requests, and avoid misuse of the platform, payment systems, uploads, or messaging features.</p>

      <h2>Orders and Delivery</h2>
      <p>Product descriptions, turnaround times, and delivery expectations are shown on the relevant product or checkout pages. Delivery timing can vary based on creator availability, asset quality, and order complexity.</p>

      <h2>User Content</h2>
      <p>When you upload files, submit requests, or share names, messages, or other material, you confirm that you have permission to use that content and that it does not violate applicable law or third-party rights.</p>

      <h2>Refunds and Changes</h2>
      <p>Refund eligibility, revision handling, and order change limitations are governed by the current refund policy and any product-specific rules shown before purchase.</p>

      <h2>Platform Availability</h2>
      <p>We may update, improve, suspend, or remove parts of the service as the platform evolves. Temporary interruptions may happen during maintenance, deployment, security work, or third-party provider issues.</p>

      <h2>Contact</h2>
      <p>If you need clarification about these terms, contact support through the website contact page before placing an order.</p>

      <div class="legal-actions">
        <a class="primary" href="/contact">Contact Support</a>
        <a class="secondary" href="/refund">View Refund Policy</a>
      </div>
    </article>
  </main>
</body>
</html>`;
}
