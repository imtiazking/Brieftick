/**
 * POST /api/checkout?plan=intelligence  →  creates a Stripe Checkout session
 *
 * Uses the Stripe REST API directly (no npm dependency).
 * Secret key is read server-side only — never exposed to the browser.
 *
 * Required env vars:
 *   STRIPE_SECRET_KEY              — from dashboard.stripe.com/apikeys
 *   STRIPE_INTELLIGENCE_PRICE_ID   — recurring price ID for Terminal £29/mo
 */

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

export default async function handler(req, res) {
  setCors(res);

  if (req.method === 'OPTIONS') return res.status(204).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  // ── Check secret key ──────────────────────────────────────────
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    console.error('[checkout] STRIPE_SECRET_KEY is not set.');
    return res.status(500).json({
      error: 'Stripe is not configured on this server. Add STRIPE_SECRET_KEY to your environment variables.',
      hint: 'For local dev: add STRIPE_SECRET_KEY to .env.local and restart vercel dev.',
    });
  }

  // ── Resolve plan → price ID ───────────────────────────────────
  const plan = (req.query.plan || '').toLowerCase();

  let priceId;
  if (plan === 'intelligence' || plan === 'terminal') {
    priceId = process.env.STRIPE_INTELLIGENCE_PRICE_ID || process.env.STRIPE_TERMINAL_PRICE_ID;
  } else {
    return res.status(400).json({ error: `Unknown plan "${plan}". Use "intelligence".` });
  }

  if (!priceId) {
    console.error(`[checkout] No price ID found for plan "${plan}".`);
    return res.status(500).json({
      error: 'Stripe price ID is not configured. Add STRIPE_INTELLIGENCE_PRICE_ID to your environment variables.',
      hint: 'For local dev: add STRIPE_INTELLIGENCE_PRICE_ID to .env.local and restart vercel dev.',
    });
  }

  // ── Build base URL (works on Vercel + local vercel dev) ───────
  const host  = req.headers['x-forwarded-host'] || req.headers.host || 'brieftick.vercel.app';
  const proto = req.headers['x-forwarded-proto'] || (host.includes('localhost') ? 'http' : 'https');
  const baseUrl = `${proto}://${host}`;

  // ── Create Stripe Checkout session ────────────────────────────
  const params = new URLSearchParams({
    mode:                            'subscription',
    'line_items[0][price]':          priceId,
    'line_items[0][quantity]':       '1',
    success_url:                     `${baseUrl}/success?plan=terminal&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url:                      `${baseUrl}/?tab=pricing`,
    'subscription_data[metadata][plan]': 'terminal',
    allow_promotion_codes:           'true',
  });

  console.log(`[checkout] Creating session for plan="${plan}" priceId="${priceId}" baseUrl="${baseUrl}"`);

  try {
    const stripeRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        Authorization:  `Bearer ${secretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    const session = await stripeRes.json();

    if (!stripeRes.ok || session.error) {
      const msg = session.error?.message || `Stripe HTTP ${stripeRes.status}`;
      console.error('[checkout] Stripe error:', msg);
      return res.status(stripeRes.status || 502).json({ error: msg });
    }

    console.log('[checkout] Session created:', session.id);
    return res.status(200).json({ url: session.url });

  } catch (err) {
    console.error('[checkout] Unexpected error:', err.message);
    return res.status(502).json({
      error: 'Could not reach Stripe. Check your internet connection and try again.',
    });
  }
}
