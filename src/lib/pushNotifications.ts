// @ts-nocheck
/**
 * src/lib/pushNotifications.js
 *
 * CHANGE: sendTokenToBackend now POSTs to POST /device-tokens (the real,
 * existing backend endpoint) instead of the 404 /driver/push-tokens.
 * Also added removeTokenFromBackend() for logout cleanup.
 *
 * Push payloads the driver app handles (Document C §10):
 *   ALLOCATION_MADE  → navigate to active trip
 *   TRIP_STATUS      → refetch booking
 *   PAYMENT_RECEIVED → refetch booking
 */
import { useEffect } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { api } from '../api/client';

// Last token registered this session — needed to unregister it on logout,
// which previously never happened (removeTokenFromBackend existed but had no
// caller), so a logged-out phone kept receiving the previous driver's pushes.
let lastRegisteredToken = null;
export function getLastPushToken() {
  return lastRegisteredToken;
}

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export async function registerForPushNotifications() {
  if (!Device.isDevice) return null; // simulators/emulators have no push token

  const { status: existing } = await Notifications.getPermissionsAsync();
  let status = existing;
  if (status !== 'granted') {
    const req = await Notifications.requestPermissionsAsync();
    status = req.status;
  }
  if (status !== 'granted') return null;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FFC107',
    });
  }

  try {
    const { data: token } = await Notifications.getDevicePushTokenAsync();
    return typeof token === 'string' ? token : null;
  } catch {
    return null;
  }
}

/**
 * POST /device-tokens { token, platform }
 * Upsert — safe to call on every launch / token refresh.
 * platform ∈ {android, ios} — Document C §10.
 */
export async function sendTokenToBackend(token) {
  if (!token) return;
  try {
    await api.post('/device-tokens', { token, platform: Platform.OS });
    lastRegisteredToken = token;
  } catch {
    /* best-effort — retried on next launch */
  }
}

/**
 * DELETE /device-tokens { token } — call on logout so the driver stops
 * receiving push notifications after signing out.
 */
export async function removeTokenFromBackend(token) {
  if (!token) return;
  try {
    // skipSessionExpiry: runs during logout; a 401 here must not re-enter
    // the session-expired path.
    await api.del('/device-tokens', { body: { token }, skipSessionExpiry: true });
  } catch {
    /* best-effort */
  } finally {
    if (lastRegisteredToken === token) lastRegisteredToken = null;
  }
}

export function usePushNotifications() {
  useEffect(() => {
    let cancelled = false;
    registerForPushNotifications()
      .then((token) => { if (!cancelled && token) return sendTokenToBackend(token); })
      .catch(() => {});
    // Tokens can rotate while the app is running (FCM/APNs refresh).
    const sub = Notifications.addPushTokenListener(({ data }) => {
      if (!cancelled && typeof data === 'string') sendTokenToBackend(data);
    });
    return () => { cancelled = true; sub.remove(); };
  }, []);
}
