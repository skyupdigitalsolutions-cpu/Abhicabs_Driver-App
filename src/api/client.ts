/**
 * src/api/client.js
 *
 * FIX: token handling hardened.
 *   • extractTokens() pulls accessToken/refreshToken out of ANY common
 *     response shape (data.accessToken, data.token, data.tokens.accessToken,
 *     access_token, nested auth/session, etc.). This is the real fix for
 *     "Authorization header missing" after register/login.
 *   • isRealToken() rejects null/undefined and the literal strings
 *     "undefined"/"null" so we never send `Bearer undefined`.
 *   • setTokens/getTokens/header-attach all use isRealToken.
 *
 * Tokens stored via secureStorage (expo-secure-store, SEC-7).
 */
import * as secureStorage from '../lib/secureStorage';
import type { TokenPair, ApiErrorOptions } from '../types';
import { API_BASE_URL } from '../config';

// Re-exported so existing imports (`from '../api/client'`) keep working.
export { API_BASE_URL };

export class ApiError extends Error {
  code?: string;
  status?: number;
  fields?: Record<string, string>;

  constructor(message: string, { code, status, fields }: ApiErrorOptions = {}) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.fields = fields;
  }
}

// FIX (session desync): a failed token refresh used to just clearTokens()
// and stop — nothing told the app's session store you were logged out, so
// Root() in App.js kept rendering MainTabs with a dead token until the app
// was force-closed. api/client.js can't import session.js directly (it's
// already a dependency of session.js — that'd be circular), so session.js
// registers itself here once, at import time, via setOnSessionExpired().
let onSessionExpired: () => void = () => {};
export function setOnSessionExpired(fn: () => void) {
  onSessionExpired = fn;
}

/** A token is only usable if it's a real, non-empty string. */
export function isRealToken(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0 && v !== 'undefined' && v !== 'null';
}

/**
 * Pull tokens out of whatever the backend returned. request() already unwraps
 * one `data` level, but register/login responses vary, so we dig defensively.
 * Returns { accessToken, refreshToken } — accessToken may be undefined.
 */
export function extractTokens(payload: any): TokenPair {
  if (!payload || typeof payload !== 'object') return {};
  const nests = [
    payload,
    payload.data,
    payload.tokens,
    payload.data && payload.data.tokens,
    payload.auth,
    payload.data && payload.data.auth,
    payload.session,
    payload.data && payload.data.session,
  ].filter((x) => x && typeof x === 'object');

  for (const c of nests) {
    const accessToken =
      c.accessToken ?? c.access_token ?? c.token ?? c.jwt ?? c.accessJwt;
    const refreshToken =
      c.refreshToken ?? c.refresh_token ?? c.refresh ?? c.refreshJwt ?? null;
    if (isRealToken(accessToken)) return { accessToken, refreshToken };
  }
  return {};
}

async function getTokens(): Promise<TokenPair> {
  const [accessToken, refreshToken] = await Promise.all([
    secureStorage.getItem('accessToken'),
    secureStorage.getItem('refreshToken'),
  ]);
  return {
    accessToken: isRealToken(accessToken) ? accessToken : null,
    refreshToken: isRealToken(refreshToken) ? refreshToken : null,
  };
}

export async function setTokens({ accessToken, refreshToken }: TokenPair = {}): Promise<void> {
  const pairs = [];
  if (isRealToken(accessToken)) pairs.push(['accessToken', accessToken]);
  if (isRealToken(refreshToken)) pairs.push(['refreshToken', refreshToken]);
  if (pairs.length) await secureStorage.multiSet(pairs);
}

export async function clearTokens(): Promise<void> {
  await secureStorage.multiRemove(['accessToken', 'refreshToken']);
}

export async function isAuthenticated(): Promise<boolean> {
  const { accessToken } = await getTokens();
  return !!accessToken;
}

/** Default per-request timeout. Without this a hung/booting server leaves
 *  the UI spinning forever with no error and no way back. */
const REQUEST_TIMEOUT_MS = 20000;

async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs: number = REQUEST_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Turn a failed response into a user-facing message.
 *
 * Why: when the backend is down, the host (Railway) answers instead of the
 * app with its own page — e.g. "Application failed to respond" — and that
 * string was being shown verbatim in the driver's alert. It reads like the
 * driver typed something wrong, when in fact the server is simply
 * unreachable. Anything 5xx (or an unparseable body) is an outage, so it
 * gets an outage message and an OUTAGE code the screens can key off.
 */
function describeFailure(status: number, json: any, bodyWasJson: boolean): { message: string; code?: string } {
  const e = json.error || {};
  const backendMsg = e.message || json.message;

  if (status === 502 || status === 503 || status === 504) {
    return { message: 'The server is temporarily unavailable. Please try again in a moment.', code: 'SERVER_UNAVAILABLE' };
  }
  if (status >= 500) {
    return { message: 'Something went wrong on our end. Please try again shortly.', code: e.code || 'SERVER_ERROR' };
  }
  // 4xx with no parseable JSON body is almost always a proxy/CDN page too.
  if (!bodyWasJson) {
    return { message: 'Could not reach the server. Please try again.', code: 'BAD_RESPONSE' };
  }
  return { message: backendMsg || 'Something went wrong.', code: e.code };
}

/**
 * Single-flight refresh. Several screens fire requests at once (Home polls
 * the active trip while Trips loads its list), so an expired token used to
 * kick off one refresh PER in-flight request. They raced: the first rotated
 * the refresh token, the rest then sent the now-invalid old one, failed,
 * and each called onSessionExpired() — logging the driver out even though
 * the first refresh had actually succeeded. Sharing one promise fixes it.
 */
let refreshPromise: Promise<string | null> | null = null;

function refreshAccessToken(): Promise<string | null> {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    const { refreshToken } = await getTokens();
    if (!refreshToken) return null;
    try {
      const res = await fetchWithTimeout(`${API_BASE_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      if (!res.ok) return null;
      const json = await res.json();
      const { accessToken, refreshToken: newRefresh } = extractTokens(json);
      if (!isRealToken(accessToken)) return null;
      await setTokens({ accessToken, refreshToken: newRefresh ?? refreshToken });
      return accessToken;
    } catch {
      return null;
    } finally {
      // Release on the next tick so concurrent callers all observe the same
      // settled result before a fresh attempt becomes possible.
      setTimeout(() => { refreshPromise = null; }, 0);
    }
  })();
  return refreshPromise;
}

interface RequestOptions {
  body?: any;
  auth?: boolean;
  _retried?: boolean;
  skipSessionExpiry?: boolean;
}

async function request(method: string, path: string, { body, auth = true, _retried = false, skipSessionExpiry = false }: RequestOptions = {}): Promise<any> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (auth) {
    const { accessToken } = await getTokens();
    if (isRealToken(accessToken)) headers.Authorization = `Bearer ${accessToken}`;
  }

  let res;
  try {
    res = await fetchWithTimeout(`${API_BASE_URL}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    if ((err as any)?.name === 'AbortError') {
      throw new ApiError('The server took too long to respond. Please try again.', {
        code: 'TIMEOUT', status: 0,
      });
    }
    throw new ApiError('Network error — please check your connection.', {
      code: 'NETWORK_ERROR', status: 0,
    });
  }

  let json: any = {};
  let bodyWasJson = true;
  try { json = await res.json(); } catch { bodyWasJson = false; }
  if (!json || typeof json !== 'object') { json = {}; bodyWasJson = false; }

  if (res.status === 401 && auth && !_retried && !skipSessionExpiry) {
    const newToken = await refreshAccessToken();
    if (newToken) return request(method, path, { body, auth, _retried: true, skipSessionExpiry });
    // Refresh genuinely failed → this is a real session expiry, not a
    // transient error. Clear storage AND force the app back to the Login
    // screen immediately, instead of leaving MainTabs up with a dead token.
    await clearTokens();
    onSessionExpired();
  }

  if (!res.ok || json.success === false) {
    const { message, code } = describeFailure(res.status, json, bodyWasJson);
    throw new ApiError(message, { code, status: res.status, fields: (json.error || {}).fields });
  }

  return json.data !== undefined ? json.data : json;
}

export async function postForm(path: string, formData: FormData, { auth = true, _retried = false }: { auth?: boolean; _retried?: boolean } = {}): Promise<any> {
  const headers: Record<string, string> = {};
  if (auth) {
    const { accessToken } = await getTokens();
    if (isRealToken(accessToken)) headers.Authorization = `Bearer ${accessToken}`;
  }

  let res;
  try {
    // Uploads are large — give them a longer ceiling than a normal call.
    res = await fetchWithTimeout(
      `${API_BASE_URL}${path}`,
      { method: 'POST', headers, body: formData },
      60000,
    );
  } catch (err) {
    if ((err as any)?.name === 'AbortError') {
      throw new ApiError('The upload timed out. Check your connection and try again.', {
        code: 'TIMEOUT', status: 0,
      });
    }
    throw new ApiError('Network error — please check your connection.', {
      code: 'NETWORK_ERROR', status: 0,
    });
  }

  let json: any = {};
  let bodyWasJson = true;
  try { json = await res.json(); } catch { bodyWasJson = false; }
  if (!json || typeof json !== 'object') { json = {}; bodyWasJson = false; }

  if (res.status === 401 && auth && !_retried) {
    const newToken = await refreshAccessToken();
    if (newToken) return postForm(path, formData, { auth, _retried: true });
    await clearTokens();
    onSessionExpired(); // same fix as request() above
  }

  if (!res.ok || json.success === false) {
    const { message, code } = describeFailure(res.status, json, bodyWasJson);
    throw new ApiError(message, { code, status: res.status, fields: (json.error || {}).fields });
  }

  return json.data !== undefined ? json.data : json;
}

export const api: {
  get: (path: string, opts?: RequestOptions) => Promise<any>;
  post: (path: string, body?: any, opts?: RequestOptions) => Promise<any>;
  patch: (path: string, body?: any, opts?: RequestOptions) => Promise<any>;
  del: (path: string, opts?: RequestOptions) => Promise<any>;
  postForm: (path: string, fd: FormData, opts?: { auth?: boolean; _retried?: boolean }) => Promise<any>;
} = {
  get:      (path, opts)       => request('GET',    path, opts),
  post:     (path, body, opts) => request('POST',   path, { ...opts, body }),
  patch:    (path, body, opts) => request('PATCH',  path, { ...opts, body }),
  del:      (path, opts)       => request('DELETE', path, opts),
  postForm: (path, fd, opts)   => postForm(path, fd, opts),
};
