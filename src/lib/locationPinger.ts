// @ts-nocheck
/**
 * src/lib/locationPinger.ts
 *
 * 6-second foreground GPS heartbeat → POST /driver/location/ping
 * { lat, lng, bookingId?, speed?, heading? }.
 *
 * FIXES:
 *   • bookingId was NEVER sent. startLocationPinger() stored the getter and
 *     then called stopLocationPinger(), which reset that same getter to null,
 *     so every ping went out without a bookingId and the backend's GPS
 *     auto-arrive / trip checkpoints could not work.
 *   • Ticks no longer overlap: a slow GPS fix (common indoors, >6 s) used to
 *     start a second getCurrentPositionAsync on top of the first.
 *   • Permission is exposed separately (ensureLocationPermission) so the
 *     caller can ask BEFORE telling the server the driver is online.
 *
 * Limitation: foreground-only. Background tracking needs expo-task-manager.
 */
import * as Location from 'expo-location';
import { locationApi } from '../api/endpoints';

let interval = null;
let activeBookingIdGetter = null;
let tickInFlight = false;

export async function ensureLocationPermission() {
  try {
    const current = await Location.getForegroundPermissionsAsync();
    if (current.status === 'granted') return true;
    const req = await Location.requestForegroundPermissionsAsync();
    return req.status === 'granted';
  } catch {
    return false;
  }
}

async function tick() {
  if (tickInFlight) return;
  tickInFlight = true;
  try {
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    const bookingId = activeBookingIdGetter ? activeBookingIdGetter() : null;
    // expo-location reports m/s; the backend validator (0..400) is km/h.
    const rawSpeed = pos.coords.speed;
    const speedKmph = Number.isFinite(rawSpeed) && rawSpeed >= 0
      ? Math.min(400, Math.round(rawSpeed * 3.6))
      : null;
    await locationApi.ping(pos.coords.latitude, pos.coords.longitude, bookingId, speedKmph, pos.coords.heading);
  } catch {
    // A single missed ping is fine — the next tick retries.
  } finally {
    tickInFlight = false;
  }
}

/**
 * @param getActiveBookingId called on every tick; returns the active trip id or null.
 * @returns true if started, false if location permission was refused.
 */
export async function startLocationPinger(getActiveBookingId = null) {
  if (!(await ensureLocationPermission())) return false;

  stopLocationPinger();                       // clear any previous timer FIRST…
  activeBookingIdGetter = getActiveBookingId; // …then install the getter.
  tick();                                     // first position immediately
  interval = setInterval(tick, 6000);
  return true;
}

export function stopLocationPinger() {
  if (interval) clearInterval(interval);
  interval = null;
  activeBookingIdGetter = null;
}

export function isLocationPingerRunning() {
  return interval !== null;
}
