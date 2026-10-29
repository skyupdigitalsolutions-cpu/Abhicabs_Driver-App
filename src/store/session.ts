// @ts-nocheck
/**
 * src/store/session.ts
 *
 * Tiny global session store (module state + listeners) consumed by App.tsx's
 * Root router and by screens via useSession().
 *
 * status:        'loading' | 'authenticated' | 'unauthenticated' | 'error'
 * driverStatus:  'loading' | 'pending' | 'approved' | 'unauthenticated'
 *
 * driverStatus reflects DRIVER KYC approval only (kycStatus === 'VERIFIED');
 * a vehicle is optional for reaching the main app. Dispatch eligibility
 * (KYC + approved vehicle) is `onboarding.isApproved`.
 *
 * FIXES in this revision:
 *   • A network failure / timeout / 5xx while loading the session no longer
 *     signs the driver out (it used to drop them on the Login screen every
 *     time the phone started the app with poor signal) and no longer pushes
 *     an APPROVED driver into the onboarding flow because /driver/me failed.
 *     It now shows status 'error' with a Retry button; only a genuine 401
 *     ends the session.
 *   • refresh() is "silent": it re-fetches without flipping the app back to
 *     the full-screen splash. Previously every refresh() — after adding a
 *     vehicle from Profile, "Check approval status", etc. — unmounted the
 *     whole navigator, throwing away the navigation stack.
 *   • Overlapping loads can't clobber each other (last call wins).
 *   • Logging out / session expiry now also stops the GPS pinger, closes the
 *     socket, tells the server the driver is offline, unregisters the push
 *     token and wipes Redux — none of which happened before, so a logged-out
 *     phone kept pinging location and receiving the old driver's pushes.
 */
import { useEffect, useState, useCallback } from 'react';
// expo-secure-store, NOT AsyncStorage (see lib/secureStorage).
import * as secureStorage from '../lib/secureStorage';
import { isAuthenticated as checkTokenExists, setOnSessionExpired, clearTokens } from '../api/client';
import { authApi, profileApi, locationApi } from '../api/endpoints';
import { stopLocationPinger } from '../lib/locationPinger';
import { disconnectSocket } from '../realtime/socket';
import { getLastPushToken, removeTokenFromBackend } from '../lib/pushNotifications';
import { store, resetStore } from './store';

const VEHICLE_SKIPPED_KEY = 'vehicleRegistrationSkipped';

let listeners = [];
let state = {
  status:         'loading',
  driverStatus:   'loading',
  user:           null,
  onboarding:     null,
  vehicleSkipped: false,
  error:          null,
};

function setState(next) {
  state = { ...state, ...next };
  listeners.forEach((l) => l(state));
}

const UNAUTHENTICATED = {
  status: 'unauthenticated', driverStatus: 'unauthenticated',
  user: null, onboarding: null, vehicleSkipped: false, error: null,
};

function isAuthFailure(err) {
  return err?.status === 401 || err?.status === 403;
}

let loadGeneration = 0;

/**
 * Load (or reload) the session.
 * @param {{ silent?: boolean }} opts silent = keep the current screen while
 *   re-fetching, and keep the current state if the network fails.
 * @returns {Promise<boolean>} true if the session data was refreshed.
 */
export async function initSession({ silent = false } = {}) {
  const gen = ++loadGeneration;
  const stale = () => gen !== loadGeneration;
  const keepOnFailure = silent && state.status === 'authenticated' && state.driverStatus !== 'loading';

  let hasToken = false;
  try {
    hasToken = await checkTokenExists();
  } catch {
    hasToken = false; // Keychain not ready on a fresh simulator install, etc.
  }
  if (stale()) return false;
  if (!hasToken) {
    setState(UNAUTHENTICATED);
    return false;
  }

  if (!keepOnFailure) {
    setState({ status: 'authenticated', driverStatus: 'loading', error: null });
  }

  // Step 1: verify the token + base user.
  let me;
  try {
    me = await authApi.getMe();
  } catch (err) {
    if (stale()) return false;
    if (isAuthFailure(err)) { setState(UNAUTHENTICATED); return false; }
    if (!keepOnFailure) setState({ status: 'error', driverStatus: 'loading', error: err?.message || 'Could not reach the server.' });
    return false;
  }
  if (stale()) return false;

  // Step 2: driver record — kycStatus + onboarding live here, not on User.
  let driverData = null;
  try {
    driverData = await profileApi.getMe();
  } catch (err) {
    if (stale()) return false;
    if (isAuthFailure(err)) { setState(UNAUTHENTICATED); return false; }
    if (err?.status !== 404) {
      // Network/server failure: don't guess — an approved driver must not be
      // routed into onboarding just because this request failed.
      if (!keepOnFailure) setState({ status: 'error', driverStatus: 'loading', error: err?.message || 'Could not reach the server.' });
      return false;
    }
    // 404 = freshly registered, no Driver row yet → onboarding from scratch.
  }
  if (stale()) return false;

  const user = me?.user ?? me;
  const kycStatus = driverData?.driver?.kycStatus ?? driverData?.onboarding?.kycStatus;
  const hasVehicle = !!driverData?.onboarding?.hasVehicle;

  // The "skip vehicle" flag only matters while there's no vehicle.
  let vehicleSkipped = false;
  if (hasVehicle) {
    secureStorage.removeItem(VEHICLE_SKIPPED_KEY).catch(() => {});
  } else {
    // Preserve a skip chosen earlier in THIS session even if its background
    // Keychain write hasn't landed yet — otherwise a refresh (e.g. on the
    // Application-Pending screen) could read the flag as unset and bounce the
    // driver back to Register Vehicle. Fall back to the persisted flag for a
    // fresh app launch.
    let stored = false;
    try { stored = (await secureStorage.getItem(VEHICLE_SKIPPED_KEY)) === '1'; } catch { stored = false; }
    vehicleSkipped = state.vehicleSkipped === true || stored;
  }
  if (stale()) return false;

  setState({
    status:       'authenticated',
    user,
    onboarding:   driverData?.onboarding ?? null,
    driverStatus: kycStatus === 'VERIFIED' ? 'approved' : 'pending',
    vehicleSkipped,
    error:        null,
  });
  return true;
}

/** "I'll add a vehicle later" on RegisterVehicleScreen (onboarding only). */
export async function skipVehicleRegistration() {
  // Flip session state FIRST so Root() recomputes the onboarding step and the
  // navigator remounts onto the next screen immediately. Persisting the flag is
  // best-effort and must never gate the UI: SecureStore.setItemAsync is a native
  // Keychain write that can be slow (or stall) on some devices, and awaiting it
  // here used to hold up the state flip — which made "Skip for now" look dead.
  setState({ vehicleSkipped: true });
  secureStorage.setItem(VEHICLE_SKIPPED_KEY, '1').catch(() => { /* best-effort */ });
}

/**
 * Tear the session down LOCALLY — no network call. Used by logout(), by
 * deleteAccount(), and by the API client when a token refresh fails (it must
 * not be logout(): that issues an authed request, which could 401 and recurse).
 */
function clearSessionLocally() {
  loadGeneration++; // invalidate any in-flight initSession()
  stopLocationPinger();
  disconnectSocket();
  resetStore();
  setState(UNAUTHENTICATED);
}

function withTimeout(promise, ms) {
  return Promise.race([promise, new Promise((resolve) => setTimeout(resolve, ms))]);
}

let loggingOut = false;

export async function logout() {
  if (loggingOut) return;
  loggingOut = true;

  // Capture before the store is wiped.
  const wasOnline = !!store.getState().driverStatus?.isOnline;
  const pushToken = getLastPushToken();

  // Sign out locally first — logging out must never wait on the server.
  clearSessionLocally();
  // Per-driver onboarding choice; must not carry over to the next account.
  secureStorage.removeItem(VEHICLE_SKIPPED_KEY).catch(() => {});

  try {
    // Best-effort server cleanup while the tokens still exist. Capped so a
    // dead backend can't hold up the token wipe below.
    await withTimeout(Promise.allSettled([
      wasOnline ? locationApi.goOffline({ skipSessionExpiry: true }) : Promise.resolve(),
      removeTokenFromBackend(pushToken),
    ]), 5000);
    await withTimeout(authApi.logout(), 8000); // revoke refresh token + clear tokens
  } catch {
    /* already signed out locally */
  } finally {
    await clearTokens().catch(() => {});
    loggingOut = false;
  }
}

/**
 * Permanently delete the account. Unlike logout(), the session is only
 * cleared AFTER the server confirms — on failure the driver stays signed in
 * and sees the error.
 */
export async function deleteAccount() {
  await profileApi.deleteAccount(); // throws on failure
  await clearTokens().catch(() => {});
  secureStorage.removeItem(VEHICLE_SKIPPED_KEY).catch(() => {});
  clearSessionLocally();
}

export function useSession() {
  const [s, setLocalState] = useState(state);
  useEffect(() => {
    listeners.push(setLocalState);
    // Catch any change that happened between the first render and this effect.
    setLocalState(state);
    return () => {
      listeners = listeners.filter((l) => l !== setLocalState);
    };
  }, []);
  const refresh = useCallback(() => initSession({ silent: true }), []);
  return { ...s, refresh };
}

// Token refresh failed in the API client → back to Login immediately.
setOnSessionExpired(clearSessionLocally);
