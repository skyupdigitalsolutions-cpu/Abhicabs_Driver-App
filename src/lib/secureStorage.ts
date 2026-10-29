// @ts-nocheck
/**
 * src/lib/secureStorage.js
 *
 * Wrapper around expo-secure-store (device Keystore/Keychain, SEC-7).
 *
 * FIX: never persist null/undefined/"" and never hand back the literal
 * strings "undefined"/"null" on read — that used to produce a truthy but
 * garbage token (`Bearer undefined`) or mask a missing token.
 */
import * as SecureStore from 'expo-secure-store';

function isStorable(v) {
  return typeof v === 'string' && v.length > 0 && v !== 'undefined' && v !== 'null';
}

export async function getItem(key) {
  try {
    const v = await SecureStore.getItemAsync(key);
    return isStorable(v) ? v : null;
  } catch {
    return null;
  }
}

export async function setItem(key, value) {
  // Skip junk writes rather than storing "undefined"/"null".
  if (!isStorable(typeof value === 'string' ? value : String(value))) {
    try { await SecureStore.deleteItemAsync(key); } catch { /* ignore */ }
    return;
  }
  await SecureStore.setItemAsync(key, String(value));
}

export async function removeItem(key) {
  try { await SecureStore.deleteItemAsync(key); } catch { /* not present is fine */ }
}

export async function multiSet(pairs) {
  await Promise.all(pairs.map(([key, value]) => setItem(key, value)));
}

export async function multiRemove(keys) {
  await Promise.all(keys.map((key) => removeItem(key)));
}
