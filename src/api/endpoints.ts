// @ts-nocheck
/**
 * src/api/endpoints.js
 *
 * FIX 1: register()/verifyOtp() use extractTokens() (any response shape) and
 *        throw a clear error if no access token is returned — root cause of
 *        "Authorization header missing" on later authed calls.
 * AUTH:  Driver login is by MOBILE NUMBER + OTP (SMS). requestOtp/verifyOtp
 *        send { phone } / { phone, code } with the number normalised to E.164
 *        (+91…). Email-OTP login has been removed.
 *        The backend already supports this (verified against authOtp.service /
 *        otp.schemas): POST /auth/otp/request { phone } resolves the driver by
 *        the last 10 digits, sends the code over SMS, and returns NOT_REGISTERED
 *        for an unknown number; POST /auth/otp/verify { phone, code } returns
 *        the session tokens. (Phone wins over email when both are sent, so even
 *        the E.164 form is matched correctly.)
 * FIX 4: uploads share fileFromUri() for a correct MIME type (image/jpeg,
 *        not image/jpg).
 * FIX 3: phone still normalised to E.164 for the register payload.
 */
import { api, postForm, setTokens, clearTokens, extractTokens, ApiError } from './client';
import { driverTrips } from './driverTrips';
import { fileFromUri } from './upload';

export { fileFromUri };

/** Normalise an Indian mobile number to E.164, e.g. "6362168219" -> "+916362168219". */
export function toE164(phone) {
  const raw = String(phone ?? '').trim();
  if (raw.startsWith('+')) return raw.replace(/[^\d+]/g, '');
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith('91')) return `+${digits}`;
  if (digits.length === 11 && digits.startsWith('0')) return `+91${digits.slice(1)}`;
  return `+${digits}`;
}

const normEmail = (e) => String(e ?? '').trim().toLowerCase();

async function storeTokensFrom(data, failMessage) {
  const { accessToken, refreshToken } = extractTokens(data);
  if (!accessToken) {
    throw new ApiError(failMessage, { code: 'NO_TOKEN', status: 0 });
  }
  await setTokens({ accessToken, refreshToken });
  return data;
}

// ── Auth (mobile-number OTP via SMS) ──────────────────────────────────────────
export const authApi = {
  /**
   * Step 1: text a 4–6 digit OTP to the driver's mobile number.
   * `phone` is normalised to E.164 (+91…) so it matches the number stored at
   * registration. A phone with no driver account returns code NOT_REGISTERED,
   * which the Login screen turns into an "Apply" prompt.
   */
  async requestOtp(phone) {
    return api.post('/auth/otp/request', { phone: toE164(phone) }, { auth: false });
  },

  /** Step 2: verify the OTP + log in. */
  async verifyOtp(phone, code) {
    const data = await api.post(
      '/auth/otp/verify',
      { phone: toE164(phone), code: String(code).trim() },
      { auth: false },
    );
    return storeTokensFrom(data, 'Login succeeded but no session token was returned. Please try again.');
  },

  async logout() {
    // skipSessionExpiry: a 401 here just means the token was already dead,
    // which is a fine outcome for a logout. Without this the 401 would run
    // the refresh-failure path and re-enter logout (see session.js).
    try { await api.post('/auth/logout', {}, { skipSessionExpiry: true }); } catch { /* best-effort */ }
    await clearTokens();
  },

  async getMe() {
    return api.get('/auth/me');
  },
};

// ── Driver registration (onboarding flow) ─────────────────────────────────────
export const driverApplicationApi = {
  /** POST /auth/driver/register — creates account + auto-logs in */
  async register(fields) {
    // Email is OPTIONAL on the backend (a placeholder is generated when absent),
    // so OMIT it when blank — sending an empty string would fail email
    // validation (422). Same for any other blank optional field (e.g.
    // licenceExpiry): drop empties so they read as "not provided".
    const payload = { ...fields, phone: toE164(fields.phone) };
    const email = normEmail(fields.email);
    if (email) payload.email = email; else delete payload.email;
    Object.keys(payload).forEach((k) => {
      if (payload[k] === '' || payload[k] == null) delete payload[k];
    });
    const data = await api.post('/auth/driver/register', payload, { auth: false });
    return storeTokensFrom(data, 'Account created but no login token was returned. Please go to Login and sign in.');
  },

  async registerVehicle(fields) {
    // eslint-disable-next-line no-unused-vars
    const { fuelType, ...safe } = fields;
    return api.post('/driver/me/vehicles', safe);
  },

  async submit() {
    return api.post('/driver/me/submit', {});
  },

  async getOnboarding() {
    return api.get('/driver/me/onboarding');
  },
};

// ── Location & availability ───────────────────────────────────────────────────
export const locationApi = {
  goOnline()  { return api.post('/driver/location/online', {}); },
  goOffline(opts) { return api.post('/driver/location/offline', {}, opts); },
  ping(lat, lng, bookingId = null, speed = null, heading = null) {
    const body = { lat, lng };
    if (bookingId) body.bookingId = bookingId;
    // Both optional server-side. Omitted entirely when the device reports an
    // unusable value (expo-location uses -1 for "unknown"), rather than sent
    // as 0 — the backend validator range is 0..400 / 0..360, so a -1 would
    // 400 the whole ping and lose the position too.
    if (Number.isFinite(speed) && speed >= 0) body.speed = speed;
    if (Number.isFinite(heading) && heading >= 0 && heading <= 360) body.heading = heading;
    return api.post('/driver/location/ping', body);
  },
};

// ── Active trip actions (driver side) ─────────────────────────────────────────
export const tripApi = {
  getTrip(bookingId) {
    return driverTrips.getById(bookingId);
  },
  markReached(bookingId) {
    return api.post(`/driver/bookings/${bookingId}/reached`, {});
  },
  collectCash(bookingId) {
    return api.post(`/driver/bookings/${bookingId}/collect-cash`, {});
  },
  async recordOdometer(bookingId, odometerKm, photoUri) {
    const fd = new FormData();
    fd.append('odometerKm', String(odometerKm));
    if (photoUri) fd.append('photo', fileFromUri(photoUri, 'odometer.jpg'));
    return postForm(`/driver/bookings/${bookingId}/odometer`, fd);
  },
};

// ── Record actual km driven ───────────────────────────────────────────────────
export const bookingDistanceApi = {
  recordDistance(bookingId, actualKm, odometerKm) {
    return api.patch(`/bookings/${bookingId}/trip-distance`, { actualKm, odometerKm });
  },
};

// ── Driver profile ────────────────────────────────────────────────────────────
export const profileApi = {
  getMe()        { return api.get('/driver/me'); },
  update(fields) { return api.patch('/driver/me', fields); },
  // Assumes the backend exposes DELETE /driver/me for permanent account
  // deletion, matching the existing GET/PATCH on the same resource. If the
  // backend route is named differently, update this one line to match.
  deleteAccount() { return api.del('/driver/me'); },
};

// ── Driver's own vehicles ─────────────────────────────────────────────────────
export const vehicleApi = {
  async getMyVehicles() {
    try {
      const data = await api.get('/driver/me/vehicles');
      return Array.isArray(data) ? data : (data?.items ?? []);
    } catch {
      return [];
    }
  },
  async registerVehicle(fields) {
    // eslint-disable-next-line no-unused-vars
    const { fuelType, ...safe } = fields;
    return api.post('/driver/me/vehicles', safe);
  },
};

// ── Public vehicle catalogue ──────────────────────────────────────────────────
// GET /vehicles is public (no auth) and is the single source of truth for the
// vehicle classes + their seat counts. The vehicle-registration screen reads it
// so the driver can register EVERY class the backend actually offers (and gets
// the right default seat count per class), instead of a hard-coded subset.
export const vehicleCatalogApi = {
  async list() {
    const data = await api.get('/vehicles', { auth: false });
    // client unwraps one `data` level → { count, vehicles: [{ key, name, seats, ... }] }
    const vehicles = Array.isArray(data) ? data : (data?.vehicles ?? data?.items ?? []);
    return vehicles;
  },
};

// ── Driver KYC documents upload ───────────────────────────────────────────────
export const documentsApi = {
  async upload(fileUri, docType) {
    const fd = new FormData();
    fd.append('file', fileFromUri(fileUri, 'document.jpg'));
    fd.append('docType', docType);
    return postForm('/driver/me/documents', fd);
  },
};

// ── Vehicle documents upload ──────────────────────────────────────────────────
export const vehicleDocsApi = {
  async upload(vehicleId, fileUri, docType, expiry = null) {
    const fd = new FormData();
    fd.append('file', fileFromUri(fileUri, 'document.jpg'));
    fd.append('docType', docType);
    if (expiry) fd.append('expiry', expiry);
    return postForm(`/driver/me/vehicles/${vehicleId}/documents`, fd);
  },
};
