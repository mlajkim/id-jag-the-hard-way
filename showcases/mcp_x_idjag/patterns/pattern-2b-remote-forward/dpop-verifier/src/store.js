// In-memory pin store (sub -> pinned DPoP public key) and jti replay cache.
// Both reset on pod restart - the client connector's /register call is
// idempotent for a key it already owns, so a restart just costs one silent
// re-registration per user on their next request, not a security regression
// (see patterns/pattern-2b-remote-forward/README.md).

const REPLAY_SWEEP_INTERVAL_MS = 60_000;

export function createPinStore() {
  const pins = new Map(); // sub -> { jkt, jwk, registeredAt }

  return {
    get(sub) {
      return pins.get(sub);
    },
    // Returns "created" | "confirmed" | "conflict".
    register(sub, jkt, jwk) {
      const existing = pins.get(sub);
      if (!existing) {
        pins.set(sub, { jkt, jwk, registeredAt: Date.now() });
        return "created";
      }
      return existing.jkt === jkt ? "confirmed" : "conflict";
    },
  };
}

export function createReplayCache(ttlMs) {
  const seen = new Map(); // "${jkt}:${jti}" -> expiresAt

  const sweep = () => {
    const now = Date.now();
    for (const [key, expiresAt] of seen) {
      if (expiresAt <= now) seen.delete(key);
    }
  };
  const timer = setInterval(sweep, REPLAY_SWEEP_INTERVAL_MS);
  timer.unref?.();

  return {
    // Returns true if this (jkt, jti) pair was already seen and is still within
    // its TTL (i.e. it's a replay). Otherwise records it and returns false.
    checkAndRecord(jkt, jti) {
      const key = `${jkt}:${jti}`;
      const now = Date.now();
      const expiresAt = seen.get(key);
      if (expiresAt !== undefined && expiresAt > now) return true;
      seen.set(key, now + ttlMs);
      return false;
    },
    stop() {
      clearInterval(timer);
    },
  };
}
