// src/jwt.js
import crypto from 'crypto';

// Encodage base64url (sans padding)
function base64url(input) {
  return Buffer.from(input).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

// Signature HS256 sans dépendance
export function signJWT(payload, secret, options = {}) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const nowSec = Math.floor(Date.now() / 1000);

  const expSec =
    options.expiresIn
      ? typeof options.expiresIn === 'string'
        ? (() => {
            const m = options.expiresIn.match(/^(\d+)([smhd])$/);
            if (!m) return nowSec + 3600;
            const n = Number(m[1]);
            const unit = m[2];
            const mult = unit === 's' ? 1 : unit === 'm' ? 60 : unit === 'h' ? 3600 : 86400;
            return nowSec + n * mult;
          })()
        : nowSec + Number(options.expiresIn)
      : nowSec + 30 * 24 * 3600;

  const fullPayload = { ...payload, iat: nowSec, exp: expSec };
  const encHeader = base64url(JSON.stringify(header));
  const encPayload = base64url(JSON.stringify(fullPayload));
  const data = `${encHeader}.${encPayload}`;
  const sig = crypto.createHmac('sha256', secret).update(data).digest('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  return `${data}.${sig}`;
}

export function verifyJWT(token, secret) {
  try {
    const [encHeader, encPayload, encSig] = token.split('.');
    if (!encHeader || !encPayload || !encSig) return null;
    const data = `${encHeader}.${encPayload}`;
    const expectedSig = crypto.createHmac('sha256', secret).update(data).digest('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
    if (expectedSig !== encSig) return null;
    const payload = JSON.parse(Buffer.from(encPayload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
    const nowSec = Math.floor(Date.now() / 1000);
    if (payload.exp && nowSec > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}
