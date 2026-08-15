/**
 * Resolve admin role from persisted user object and/or JWT access token.
 * The token is the source of truth when localStorage user is stale or incomplete.
 */

export function decodeJwtPayload(token) {
  if (!token || typeof token !== "string") return null;
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    const json = atob(part.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export function normalizeRole(role) {
  if (role == null) return null;
  const trimmed = String(role).trim();
  return trimmed || null;
}

export function getRoleFromToken(token) {
  const payload = decodeJwtPayload(token);
  return normalizeRole(payload?.role);
}

/** Prefer user.role, fall back to JWT payload role. */
export function getEffectiveRole(user, token) {
  return normalizeRole(user?.role) || getRoleFromToken(token);
}

export function hydrateAuthState(authState) {
  if (!authState || typeof authState !== "object") return authState;
  const role = getEffectiveRole(authState.user, authState.token);
  if (!role) return authState;
  return {
    ...authState,
    user: {
      ...(authState.user || {}),
      role,
    },
  };
}
