import { createHash } from 'node:crypto';

export async function sha256Hex(content) {
  const bytes = typeof content === 'string' ? Buffer.from(content, 'utf8') : Buffer.from(content);
  return createHash('sha256').update(bytes).digest('hex');
}

export async function fingerprintContent(content) {
  const normalised =
    typeof content === 'string' ? content.replace(/\r\n/g, '\n').trim() : Buffer.from(content);
  const hash = await sha256Hex(normalised);
  return { algorithm: 'SHA-256', hash };
}
