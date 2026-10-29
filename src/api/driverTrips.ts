// @ts-nocheck
/**
 * src/api/driverTrips.js
 *
 * Driver-scoped trip API. Every driver screen that touches bookings goes
 * through this file — never through the customer GET /bookings* routes
 * (which are a BOLA hole for drivers — see Document B §B-4).
 *
 * All paths verified against Document C §6 (integration contract).
 *
 * OTP flow (new — like Uber/Rapido):
 *   When the driver reaches the pickup point and calls markReached(), the
 *   backend generates a 6-digit OTP and sends it to the customer (SMS/push).
 *   The driver asks the customer for the OTP and enters it into the app.
 *   startWithOtp() sends that OTP to POST /driver/bookings/:id/start.
 *   On mismatch the backend returns INVALID_OTP (400). On match it
 *   transitions REACHED → ONGOING and the trip is running.
 */
import { api, postForm } from './client';
import { fileFromUri } from './upload';

export const driverTrips = {

  // ── Trip reads (all driver-scoped, never leak other customers' data) ──

  /** GET /driver/bookings?page=&limit=  → { items, pagination } */
  list(page = 1, limit = 10) {
    return api.get(`/driver/bookings?page=${page}&limit=${limit}`);
  },

  /**
   * GET /driver/bookings/active
   * → { booking } or null when the driver has no live trip.
   * The one booking whose allocation is ACTIVE and status ∈
   * {ALLOCATED,EN_ROUTE,REACHED,ONGOING,ARRIVED}. Cold-start backstop;
   * socket keeps it live once connected.
   */
  active() {
    return api.get('/driver/bookings/active');
  },

  /**
   * GET /driver/bookings/:id  → { booking }
   * 404 when the driver is NOT the allocated driver (no IDOR leakage).
   */
  getById(bookingId) {
    return api.get(`/driver/bookings/${bookingId}`);
  },

  // ── Lifecycle actions (all require allocation.status = ACTIVE) ────────

  /**
   * POST /driver/bookings/:id/en-route
   * ALLOCATED → EN_ROUTE. Driver is heading to pickup.
   * No longer called by the driver app (that step is now skipped), but kept
   * because dispatch still uses this transition.
   */
  enRoute(bookingId) {
    return api.post(`/driver/bookings/${bookingId}/en-route`, {});
  },

  /**
   * POST /driver/bookings/:id/reached
   * ALLOCATED | EN_ROUTE → REACHED. Driver physically at the pickup point.
   * ALLOCATED is accepted directly — the driver app no longer makes them tap
   * "start heading to pickup" first (see lifecycle.service.js REACHED.from).
   * Backend generates the customer OTP at this point and delivers it.
   */
  markReached(bookingId) {
    return api.post(`/driver/bookings/${bookingId}/reached`, {});
  },

  /**
   * POST /driver/bookings/:id/start  { otp }
   * REACHED → ONGOING. OTP validation before trip start (like Uber/Rapido).
   *
   * otp: 6-digit string the customer reads to the driver.
   * Backend validates against the OTP generated at markReached().
   * Errors:
   *   400 OTP_INVALID    — wrong code; tell driver to ask again
   *   400 OTP_EXPIRED    — OTP window passed; backend can re-issue on /reached retry
   *   400 INVALID_STATUS_TRANSITION — not in REACHED state
   *   403 NOT_ASSIGNED_DRIVER
   */
  /**
   * REACHED → ONGOING. `odometerKm` is the reading the driver types when
   * starting; the backend has always accepted it on this endpoint
   * (driverBooking.controller.js startTrip reads req.body.odometerKm) — the
   * app simply never sent it, so trips had an end reading with no start
   * reading to measure against.
   */
  startWithOtp(bookingId, otp, odometerKm = null) {
    const body = { otp: String(otp).trim() };
    if (Number.isFinite(odometerKm)) body.odometerKm = odometerKm;
    return api.post(`/driver/bookings/${bookingId}/start`, body);
  },

  /**
   * POST /driver/bookings/:id/arrived
   * ONGOING → ARRIVED. Driver physically at the drop-off point, trip still
   * running. Mirrors markReached() (pickup) for the drop side — needed
   * because complete() requires ARRIVED and nothing else in this file ever
   * sets it.
   */
  arrived(bookingId) {
    return api.post(`/driver/bookings/${bookingId}/arrived`, {});
  },

  /**
   * POST /driver/bookings/:id/complete  { actualKm?, odometerKm? }
   * ARRIVED → COMPLETED.
   * 422 PAYMENT_REQUIRED if balanceDue > 0 and paymentMode ≠ ZERO.
   * Runs finaliseBooking (invoice + ledger) + releaseVehicleForBooking in one tx.
   */
  complete(bookingId, payload = {}) {
    return api.post(`/driver/bookings/${bookingId}/complete`, payload);
  },

  /**
   * POST /driver/bookings/:id/collect-cash
   * ARRIVED | COMPLETED — collect outstanding cash balance.
   * Idempotent (ledger reference unique).
   */
  collectCash(bookingId) {
    return api.post(`/driver/bookings/${bookingId}/collect-cash`, {});
  },

  /**
   * POST /driver/bookings/:id/odometer (multipart)
   * ARRIVED | COMPLETED — record final odometer + optional photo.
   * This is a RECORD, not a completion — it does not change booking status.
   */
  async recordOdometer(bookingId, odometerKm, photoUri) {
    const fd = new FormData();
    fd.append('odometerKm', String(odometerKm));
    if (photoUri) fd.append('photo', fileFromUri(photoUri, 'odometer.jpg'));
    return postForm(`/driver/bookings/${bookingId}/odometer`, fd);
  },

  /**
   * PATCH /bookings/:id/trip-distance  { actualKm, odometerKm? }
   * ONGOING | COMPLETED — recomputes finalFare / balanceDue.
   * Driver-accessible; allocation must be ACTIVE.
   */
  recordDistance(bookingId, actualKm, odometerKm) {
    return api.patch(`/bookings/${bookingId}/trip-distance`, { actualKm, odometerKm });
  },
};

/**
 * Normalise the many response shapes the trip endpoints return into a single
 * booking object (or null). `{ booking: null }` — the "driver is idle" answer
 * from GET /driver/bookings/active — previously fell through `data.booking ??
 * data` and was stored as the active trip itself: an object with no id that
 * rendered an empty "ACTIVE TRIP" card.
 */
export function unwrapBooking(data) {
  if (!data || typeof data !== 'object') return null;
  if ('booking' in data) return data.booking && data.booking.id ? data.booking : null;
  return data.id ? data : null;
}

export const TERMINAL_STATUSES = ['COMPLETED', 'CANCELLED', 'EXPIRED'];
