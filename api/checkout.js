/**
 * POST /api/checkout?plan=intelligence  →  creates a Stripe Checkout session
 * POST /api/checkout?plan=terminal      →  creates a Stripe Checkout session
 *
 * Uses the Stripe REST API directly (no npm dependency).
 * Secret key is read server-side only — never exposed to the browser.
 */

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    return res.status(500).json({ error: 'STRIPE_SECRET_KEY is not configured on the server.' });
  }

  // Resolve price ID from plan param
  const plan = (req.query.plan || '').toLowerCase();
  let priceId;
  if (plan === 'intelligence') {
    priceId = process.env.STRIPE_INTELLIGENCE_PRICE_ID;
  } else if (plan === 'terminal') {
    priceId = process.env.STRIPE_TERMINAL_PRICE_ID;
  } else {
    return res.status(400).json({ error: `Unknown plan "${plan}". Use "intelligence" or "terminal".` });
  }

  if (!priceId) {
    return res.status(500).json({
      error: `Price ID for plan "${plan}" is not configured. Set STRIPE_${plan.toUpperCase()}_PRICE_ID in Vercel.`,
    });
  }

  // Derive the base URL so success/cancel URLs work on any environment
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'brieftick.vercel.app';
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const baseUrl = `${proto}://${host}`;

  // Build Stripe Checkout session via REST API
  const params = new URLSearchParams({
    mode: 'subscription',
    'line_items[0][price]': priceId,
    'line_items[0][quantity]': '1',
    success_url: `${baseUrl}/success?plan=${plan}&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${baseUrl}/?tab=pricing`,
    'subscription_data[metadata][plan]': plan,
    'allow_promotion_codes': 'true',
  });

  try {
    const stripeRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    const session = await stripeRes.json();

    if (!stripeRes.ok || session.error) {
      console.error('[checkout] Stripe error:', session.error);
      return res.status(stripeRes.status).json({
        error: session.error?.message || 'Stripe returned an error.',
      });
    }

    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('[checkout] Unexpected error:', err.message);
    return res.status(502).json({ error: 'Failed to reach Stripe. Please try again.' });
  }
}
