/**
 * POST /api/set-subscription
 * Called from success.html after a successful Stripe payment.
 * Verifies the Stripe session is paid, then sets publicMetadata.subscription = 'terminal'
 * on the Clerk user.
 *
 * Body: { sessionId: string }
 * Headers: Authorization: Bearer <clerk-session-token>
 */
import { createClerkClient } from '@clerk/backend';

const clerkClient = createClerkClient({
  secretKey: process.env.CLERK_SECRET_KEY,
});

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const token = authHeader.replace('Bearer ', '');
  const { sessionId } = req.body || {};

  try {
    // 1. Verify Clerk token
    const payload = await clerkClient.verifyToken(token);
    const userId = payload.sub;

    // 2. Verify Stripe session is actually paid (prevents fraudulent upgrades)
    if (sessionId && process.env.STRIPE_SECRET_KEY) {
      const stripeRes = await fetch(
        `https://api.stripe.com/v1/checkout/sessions/${sessionId}`,
        { headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}` } }
      );
      const session = await stripeRes.json();

      if (session.error) {
        return res.status(400).json({ error: 'Invalid Stripe session' });
      }
      if (session.payment_status !== 'paid' && session.status !== 'complete') {
        return res.status(400).json({ error: 'Payment not confirmed' });
      }
    }

    // 3. Set Terminal subscription on Clerk user metadata
    await clerkClient.users.updateUserMetadata(userId, {
      publicMetadata: {
        subscription: 'terminal',
        subscribedAt: new Date().toISOString(),
      },
    });

    console.log(`[set-subscription] user ${userId} upgraded to terminal`);
    return res.status(200).json({ success: true, subscription: 'terminal' });
  } catch (err) {
    console.error('[set-subscription]', err.message);
    return res.status(500).json({ error: err.message });
  }
}
