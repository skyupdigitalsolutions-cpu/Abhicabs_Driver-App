/**
 * src/config.ts — single source of truth for build-time configuration.
 *
 * EXPO_PUBLIC_* variables are inlined by Metro at build time (from .env
 * locally, or from the `env` block of the eas.json profile on EAS). Every
 * value has a production fallback so a missing variable never produces a
 * broken build — but setting the variable now actually takes effect, which
 * it previously did not (the API URL and support phone were hard-coded).
 */
const DEFAULT_API_BASE_URL = 'https://api.abhicabs24x7.com/api/v1';
const DEFAULT_SUPPORT_PHONE = '+918096000182';

function clean(v: string | undefined): string {
  return typeof v === 'string' ? v.trim() : '';
}

/** REST base, always without a trailing slash, e.g. https://host/api/v1 */
export const API_BASE_URL: string =
  (clean(process.env.EXPO_PUBLIC_API_BASE_URL) || DEFAULT_API_BASE_URL).replace(/\/+$/, '');

/** Socket.IO origin — the API base with the /api/vN suffix removed. */
export const SOCKET_URL: string = API_BASE_URL.replace(/\/api\/v\d+$/, '');

/** Support / SOS number shown on the trip screen and SOS screen. */
export const SUPPORT_PHONE: string = clean(process.env.EXPO_PUBLIC_SUPPORT_PHONE) || DEFAULT_SUPPORT_PHONE;
