// src/jwt.js
import crypto from 'crypto';

// Encodage base64url (sans padding)
function base64url(input) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input);
  return buf.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

// Décodage base64url
function fromBase64url(input) {
  return Buffer.from(input.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

/**
 * Chiffre un payload avec AES-256-GCM.
 * @param {object} payload - Données à chiffrer.
 * @param {string} secret - Clé secrète.
 * @param {object} options - Options (expiresIn).
 * @returns {string} Token chiffré.
 */
export function encryptToken(payload, secret, options = {}) {
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

  const fullPayload = JSON.stringify({ ...payload, iat: nowSec, exp: expSec });
  
  // Dérivation de clé (32 octets pour AES-256)
  const key = crypto.createHash('sha256').update(secret).digest();
  
  // IV de 12 octets (standard GCM)
  const iv = crypto.randomBytes(12);
  
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  let ciphertext = cipher.update(fullPayload, 'utf8', 'base64');
  ciphertext += cipher.final('base64');
  const authTag = cipher.getAuthTag();

  // Format: iv.ciphertext.authTag (tous en base64url)
  return `${base64url(iv)}.${base64url(Buffer.from(ciphertext, 'base64'))}.${base64url(authTag)}`;
}

/**
 * Déchiffre un token AES-256-GCM.
 * @param {string} token - Token à déchiffrer.
 * @param {string} secret - Clé secrète.
 * @returns {object|null} Payload déchiffré ou null.
 */
export function decryptToken(token, secret) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const iv = fromBase64url(parts[0]);
    const ciphertext = fromBase64url(parts[1]);
    const authTag = fromBase64url(parts[2]);

    const key = crypto.createHash('sha256').update(secret).digest();
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(ciphertext, undefined, 'utf8');
    decrypted += decipher.final('utf8');

    const payload = JSON.parse(decrypted);
    const nowSec = Math.floor(Date.now() / 1000);
    if (payload.exp && nowSec > payload.exp) return null;

    return payload;
  } catch (err) {
    return null;
  }
}
