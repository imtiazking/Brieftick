import { classifyPostgresDriverError } from './staging-postgrest-error.mjs';

/**
 * Sanitize savepoint identifier (no user input in SQL).
 * @param {string} name
 */
export function toSavepointName(name) {
  const base = String(name).replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 48);
  return `bt_${base || 'probe'}`;
}

/**
 * Run a probe inside SAVEPOINT; recover so the outer transaction can continue.
 *
 * @param {import('pg').Client} client
 * @param {string} savepointLabel
 * @param {() => Promise<unknown>} fn
 */
export async function withPgSavepointProbe(client, savepointLabel, fn) {
  const sp = toSavepointName(savepointLabel);
  await client.query(`SAVEPOINT ${sp}`);
  try {
    const result = await fn();
    await client.query(`ROLLBACK TO SAVEPOINT ${sp}`);
    await client.query(`RELEASE SAVEPOINT ${sp}`);
    await client.query('SELECT 1');
    return {
      recovered: true,
      threw: false,
      result,
      classification: null,
      sqlState: null,
      message: null,
    };
  } catch (e) {
    const sqlState = typeof e?.code === 'string' ? e.code : null;
    const message = (e?.message || String(e)).slice(0, 200);
    const classification = classifyPostgresDriverError(e);
    try {
      await client.query(`ROLLBACK TO SAVEPOINT ${sp}`);
      await client.query(`RELEASE SAVEPOINT ${sp}`);
      await client.query('SELECT 1');
    } catch (recoveryErr) {
      return {
        recovered: false,
        threw: true,
        recoveryFailed: true,
        sqlState,
        message,
        classification,
        recoverySqlState: recoveryErr?.code ?? null,
        recoveryMessage: (recoveryErr?.message || String(recoveryErr)).slice(0, 200),
      };
    }
    return {
      recovered: true,
      threw: true,
      sqlState,
      message,
      classification,
    };
  }
}
