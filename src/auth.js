// Auth SSO partagé avec le dashboard adision-app.
// Le JWT (HS256) est stocké en localStorage sous la clé "adision_jwt".
// Tous les fetch vers le backend Ad BUD doivent passer par authFetch().

const STORAGE_KEY = "adision_jwt";

const DEFAULT_DASHBOARD_URL = "https://app.adision.ca";
const DEFAULT_BUD_URL = "https://bud.adision.ca";

export function getJwt() {
  try { return localStorage.getItem(STORAGE_KEY) || ""; } catch { return ""; }
}

export function setJwt(token) {
  try { localStorage.setItem(STORAGE_KEY, token); } catch { /* ignore */ }
}

export function clearJwt() {
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
}

export function getDashboardUrl() {
  return (import.meta.env.VITE_DASHBOARD_URL || DEFAULT_DASHBOARD_URL).replace(/\/+$/, "");
}

function getBudUrl() {
  return (import.meta.env.VITE_BUD_URL || DEFAULT_BUD_URL).replace(/\/+$/, "");
}

export function redirectToLogin() {
  const dash = getDashboardUrl();
  const redirect = encodeURIComponent(getBudUrl());
  window.location.href = `${dash}/login?redirect=${redirect}`;
}

export function redirectToLogout() {
  clearJwt();
  redirectToLogin();
}

// Décode un JWT HS256 sans vérifier la signature (la vérification est faite
// côté backend via /auth/me). Sert uniquement à lire le payload pour afficher
// nom/email/role dans l'UI.
export function decodeJwt(token) {
  if (!token || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = payload + "=".repeat((4 - (payload.length % 4)) % 4);
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
}

// Capture le ?token=<JWT> au load, le stocke et nettoie l'URL.
// À appeler une seule fois au tout début de l'app.
export function captureTokenFromUrl() {
  try {
    const params = new URLSearchParams(window.location.search);
    const t = params.get("token");
    if (t) {
      setJwt(t);
      params.delete("token");
      const qs = params.toString();
      const newUrl = window.location.pathname + (qs ? `?${qs}` : "") + window.location.hash;
      window.history.replaceState({}, "", newUrl);
      return t;
    }
  } catch { /* ignore */ }
  return null;
}

// Wrapper fetch qui ajoute Authorization: Bearer <JWT> et gère le 401 en
// redirigeant vers le login du dashboard. Renvoie la Response brute pour
// laisser l'appelant lire .json() / .ok comme avec fetch().
export async function authFetch(input, init = {}) {
  const token = getJwt();
  const headers = new Headers(init.headers || {});
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const res = await fetch(input, { ...init, headers });
  if (res.status === 401) {
    // JWT invalide / expiré : on purge et on retourne au dashboard pour
    // re-login. On laisse quand même la Response remonter au cas où
    // l'appelant veut afficher quelque chose avant la redirection.
    clearJwt();
    redirectToLogin();
  }
  return res;
}
