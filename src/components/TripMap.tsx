// @ts-nocheck
/**
 * src/components/TripMap.jsx
 *
 * Real embedded map for TripScreen — replaces "open in external Maps app" as
 * the only way to see the route. Uses react-native-maps with the platform's
 * default map provider (no provider prop forced):
 *   - iOS: Apple Maps (MapKit) — no API key needed.
 *   - Android: Google Maps — REQUIRES an API key in app.json under
 *     expo.android.config.googleMaps.apiKey (see app.json; a placeholder is
 *     there — replace it with a real key from
 *     https://console.cloud.google.com/google/maps-apis, "Maps SDK for
 *     Android"). Without a real key the map tiles won't render on Android,
 *     but the app will not crash.
 *
 * Shows: a green pickup pin, a red drop pin, and the driver's own live
 * position (blue dot) from expo-location — the same permission the app
 * already requests for the location pinger. No customer/other-driver data is
 * shown here.
 */
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View, Text, ActivityIndicator } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import * as Location from 'expo-location';
import { colors, radius } from '../theme';

export function TripMap({ pickup, drop, height = 200 }) {
  const mapRef = useRef(null);
  const [myPosition, setMyPosition] = useState(null);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [mapReady, setMapReady] = useState(false);

  const hasPickup = pickup && Number.isFinite(pickup.lat) && Number.isFinite(pickup.lng);
  const hasDrop = drop && Number.isFinite(drop.lat) && Number.isFinite(drop.lng);

  // Best-effort: show the driver's own live position on the map. Uses the
  // same foreground location permission the app already requests to start
  // the GPS pinger — does not request anything new.
  useEffect(() => {
    // `cancelled` guards the async setup: if the screen closed before
    // watchPositionAsync resolved, the subscription used to leak and keep
    // the GPS running (and calling setState on an unmounted component).
    let cancelled = false;
    let sub = null;
    (async () => {
      try {
        const { status } = await Location.getForegroundPermissionsAsync();
        if (status !== 'granted') {
          const req = await Location.requestForegroundPermissionsAsync();
          if (req.status !== 'granted') { if (!cancelled) setPermissionDenied(true); return; }
        }
        if (cancelled) return;
        const s = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.Balanced, timeInterval: 5000, distanceInterval: 15 },
          (loc) => setMyPosition({ lat: loc.coords.latitude, lng: loc.coords.longitude }),
        );
        if (cancelled) s.remove(); else sub = s;
      } catch {
        if (!cancelled) setPermissionDenied(true); // location services off, etc.
      }
    })();
    return () => { cancelled = true; sub?.remove?.(); };
  }, []);

  // Fit the camera once when the pins are known, and once more when the
  // driver's position first arrives. It used to re-fit on every GPS update
  // (every ~5 s), yanking the map back whenever the driver panned or zoomed.
  const fittedWithPosition = useRef(false);
  useEffect(() => {
    if (!mapRef.current || !mapReady) return;
    if (myPosition && fittedWithPosition.current) return;
    const coords = [
      hasPickup ? { latitude: pickup.lat, longitude: pickup.lng } : null,
      hasDrop ? { latitude: drop.lat, longitude: drop.lng } : null,
      myPosition ? { latitude: myPosition.lat, longitude: myPosition.lng } : null,
    ].filter(Boolean);
    if (myPosition) fittedWithPosition.current = true;
    if (coords.length >= 2) {
      mapRef.current.fitToCoordinates(coords, {
        edgePadding: { top: 40, right: 40, bottom: 40, left: 40 },
        animated: true,
      });
    } else if (coords.length === 1) {
      mapRef.current.animateToRegion({ ...coords[0], latitudeDelta: 0.05, longitudeDelta: 0.05 }, 300);
    }
  }, [mapReady, hasPickup, hasDrop, !!myPosition]);

  if (!hasPickup && !hasDrop) {
    return (
      <View style={[styles.fallback, { height }]}>
        <Text style={styles.fallbackText}>Map unavailable — no coordinates for this trip.</Text>
      </View>
    );
  }

  const initialRegion = {
    latitude: (pickup?.lat ?? drop?.lat),
    longitude: (pickup?.lng ?? drop?.lng),
    latitudeDelta: 0.05,
    longitudeDelta: 0.05,
  };

  return (
    <View style={[styles.container, { height }]}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        initialRegion={initialRegion}
        onMapReady={() => setMapReady(true)}
        showsUserLocation={false}
        showsMyLocationButton={false}
        toolbarEnabled={false}
      >
        {hasPickup && (
          <Marker coordinate={{ latitude: pickup.lat, longitude: pickup.lng }} title="Pickup" pinColor={colors.success} />
        )}
        {hasDrop && (
          <Marker coordinate={{ latitude: drop.lat, longitude: drop.lng }} title="Drop" pinColor={colors.danger} />
        )}
        {myPosition && (
          <Marker
            coordinate={{ latitude: myPosition.lat, longitude: myPosition.lng }}
            title="You"
            anchor={{ x: 0.5, y: 0.5 }}
          >
            <View style={styles.myDotOuter}><View style={styles.myDotInner} /></View>
          </Marker>
        )}
      </MapView>

      {!myPosition && !permissionDenied && (
        <View style={styles.loadingPill}>
          <ActivityIndicator size="small" color={colors.primary} />
        </View>
      )}
      {permissionDenied && (
        <View style={styles.deniedBanner}>
          <Text style={styles.deniedText}>Location permission denied — your position won't show on the map.</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { borderRadius: radius.lg, overflow: 'hidden', backgroundColor: colors.surfaceAlt },
  fallback: { borderRadius: radius.lg, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center', padding: 16 },
  fallbackText: { fontSize: 12, color: colors.textMuted, textAlign: 'center' },
  myDotOuter: { width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(59,101,219,0.25)', alignItems: 'center', justifyContent: 'center' },
  myDotInner: { width: 12, height: 12, borderRadius: 6, backgroundColor: '#3B65DB', borderWidth: 2, borderColor: '#fff' },
  loadingPill: { position: 'absolute', top: 8, right: 8, backgroundColor: '#fff', borderRadius: 999, padding: 6, elevation: 2 },
  deniedBanner: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.65)', padding: 6 },
  deniedText: { color: '#fff', fontSize: 10, textAlign: 'center' },
});
