// src/rateLimit.js
// Rate limiter très simple en mémoire, basé sur un bucket par clé
// windowMs: fenêtre de temps en ms
// max: nombre max de requêtes autorisées par fenêtre
// NOTE: En production multi-instance, préfère un store centralisé (Redis) ou un middleware dédié.

const hits = new Map();

/**
 * Crée un rate limiter.
 * Retourne une fonction rateLimit(key) -> boolean (true si autorisé, false si bloqué).
 */
export function createRateLimiter(windowMs = 60_000, max = 60) {
  return function rateLimit(key) {
    const now = Date.now();
    const bucket = hits.get(key) || { count: 0, start: now };
    if (now - bucket.start > windowMs) {
      bucket.count = 0;
      bucket.start = now;
    }
    bucket.count += 1;
    hits.set(key, bucket);
    return bucket.count <= max;
  };
}
