import https from 'node:https';
import { URL } from 'node:url';

/**
 * Allow Node to finish closing sockets/dispatchers (Windows Node 24 UV_HANDLE_CLOSING).
 */
export async function drainNetworkResources() {
  await new Promise((resolve) => setImmediate(resolve));
  try {
    const undici = await import('undici');
    const dispatcher = undici.getGlobalDispatcher?.();
    if (dispatcher) {
      if (typeof dispatcher.destroy === 'function') {
        await dispatcher.destroy();
      } else if (typeof dispatcher.close === 'function') {
        await dispatcher.close();
      }
    }
  } catch {
    /* undici optional */
  }
  await new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * One-shot private Storage object download via node:https (no fetch / Supabase client).
 *
 * @param {{ projectUrl: string, serviceRoleKey: string, bucket: string, objectPath: string }} params
 * @returns {Promise<Buffer>}
 */
/**
 * @param {{ projectUrl: string, serviceRoleKey: string, bucket: string, objectPath: string }} params
 */
export function downloadPrivateStorageObject(params) {
  if (!params || typeof params !== 'object') {
    const err = new Error('storage_download_config_invalid: params object required');
    err.code = 'storage_download_config_invalid';
    err.missingField = 'params';
    throw err;
  }
  const missing = [];
  if (!params.projectUrl) missing.push('projectUrl');
  if (!params.serviceRoleKey) missing.push('serviceRoleKey');
  if (!params.bucket) missing.push('bucket');
  if (!params.objectPath) missing.push('objectPath');
  if (missing.length) {
    const err = new Error(`storage_download_config_invalid: missing ${missing.join(', ')}`);
    err.code = 'storage_download_config_invalid';
    err.missingField = missing[0];
    throw err;
  }

  const base = String(params.projectUrl).replace(/\/$/, '');
  const objectPath = String(params.objectPath).replace(/^\//, '');
  const encodedPath = objectPath.split('/').map((segment) => encodeURIComponent(segment)).join('/');
  const requestPath = `/storage/v1/object/${params.bucket}/${encodedPath}`;
  const origin = new URL(base);

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        protocol: origin.protocol,
        hostname: origin.hostname,
        port: origin.port || 443,
        path: requestPath,
        method: 'GET',
        headers: {
          Authorization: `Bearer ${params.serviceRoleKey}`,
          apikey: params.serviceRoleKey,
          Connection: 'close',
        },
        agent: false,
      },
      (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          const body = Buffer.concat(chunks);
          if (res.statusCode && res.statusCode >= 400) {
            reject(
              new Error(
                `storage_download_failed:${res.statusCode}:${body.toString('utf8').slice(0, 200)}`,
              ),
            );
            return;
          }
          resolve(body);
        });
        res.on('error', reject);
      },
    );

    req.on('error', reject);
    req.setTimeout(60_000, () => {
      req.destroy(new Error('storage_download_timeout'));
    });
    req.end();
  });
}
