/**
 * FORGENIQ Beta Signup API
 *
 * Accepts POST { name, email, role, message } and forwards to any
 * combination of:
 *   - SIGNUP_WEBHOOK_URL   (Zapier / Make / Slack / custom)
 *   - FORMSPREE_ID         (Formspree form id, e.g. "xabcdefg")
 *
 * If neither env var is set the request is still accepted and logged —
 * add the vars later in Vercel → Project Settings → Environment Variables.
 */

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { name = '', email = '', role = '', message = '' } = req.body || {};

  if (!email || !email.includes('@') || !email.includes('.')) {
    return res.status(400).json({ error: 'A valid email address is required.' });
  }

  const payload = {
    name: name.trim().slice(0, 120),
    email: email.trim().toLowerCase().slice(0, 254),
    role: role.trim().slice(0, 60),
    message: message.trim().slice(0, 500),
    timestamp: new Date().toISOString(),
    source: 'forgeniq-beta-signup',
  };

  const errors = [];

  // ── Webhook (Zapier / Make / Slack / any POST endpoint) ──────────
  const webhookUrl = process.env.SIGNUP_WEBHOOK_URL;
  if (webhookUrl) {
    try {
      const r = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!r.ok) errors.push(`webhook HTTP ${r.status}`);
    } catch (e) {
      errors.push(`webhook: ${e.message}`);
    }
  }

  // ── Formspree ────────────────────────────────────────────────────
  const formspreeId = process.env.FORMSPREE_ID;
  if (formspreeId) {
    try {
      // Include Origin header so Formspree validates the domain correctly.
      // _replyto tells Formspree which address to set as reply-to on the notification.
      const fsPayload = { ...payload, _replyto: payload.email };
      const r = await fetch(`https://formspree.io/f/${formspreeId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Origin': 'https://www.forgeniq.com',
          'Referer': 'https://www.forgeniq.com/',
        },
        body: JSON.stringify(fsPayload),
      });
      const body = await r.text();
      if (!r.ok) {
        errors.push(`formspree HTTP ${r.status}: ${body}`);
        console.error('[signup] Formspree error:', r.status, body);
      } else {
        console.log('[signup] Formspree delivery OK:', r.status, body.slice(0, 120));
      }
    } catch (e) {
      errors.push(`formspree: ${e.message}`);
      console.error('[signup] Formspree fetch failed:', e.message);
    }
  } else {
    console.warn('[signup] FORMSPREE_ID not set — skipping Formspree delivery');
  }

  // Always log so Vercel function logs capture it even without integrations
  console.log('[signup]', JSON.stringify(payload));
  if (errors.length) console.warn('[signup] delivery errors:', errors.join(', '));

  return res.status(200).json({
    success: true,
    message: "You're on the list. We'll be in touch shortly.",
  });
}
