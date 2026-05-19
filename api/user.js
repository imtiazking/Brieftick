/**
 * GET /api/user
 * Returns the currently authenticated Clerk user's subscription status.
 * Expects: Authorization: Bearer <clerk-session-token>
 */
import { createClerkClient } from '@clerk/backend';

const clerkClient = createClerkClient({
  secretKey: process.env.CLERK_SECRET_KEY,
});

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const token = authHeader.replace('Bearer ', '');

  try {
    const payload = await clerkClient.verifyToken(token);
    const userId = payload.sub;
    const user = await clerkClient.users.getUser(userId);

    return res.status(200).json({
      userId: user.id,
      subscription: user.publicMetadata?.subscription || 'free',
      firstName: user.firstName || null,
      email: user.emailAddresses?.[0]?.emailAddress || null,
    });
  } catch (err) {
    console.error('[api/user] verification failed:', err.message);
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}
