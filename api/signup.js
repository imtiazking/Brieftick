/**
 * BriefTick Beta Signup API
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
    source: 'brieftick-beta-signup',
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
      const r = await fetch(`https://formspree.io/f/${formspreeId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!r.ok) errors.push(`formspree HTTP ${r.status}`);
    } catch (e) {
      errors.push(`formspree: ${e.message}`);
    }
  }

  // Always log so Vercel function logs capture it even without integrations
  console.log('[signup]', JSON.stringify(payload));
  if (errors.length) console.warn('[signup] delivery errors:', errors.join(', '));

  return res.status(200).json({
    success: true,
    message: "You're on the list. We'll be in touch shortly.",
  });
}
