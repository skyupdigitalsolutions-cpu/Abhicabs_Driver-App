// @ts-nocheck
/**
 * TemporaryDriverScreen.jsx
 *
 * The ENTIRE app surface for a TEMPORARY driver — no tabs, no onboarding, no
 * profile/earnings. App.js should render *only* this screen (no navigator
 * needed around it) once session.driverType === 'TEMPORARY'. See the App.js
 * note in the patch README for the one-branch change that routes here.
 *
 * Shows: assigned vehicle number + whatever trip is currently dispatched to
 * it, with just enough action buttons to actually run that trip (otherwise a
 * temp driver could see a trip but never advance it). Reuses the same
 * driver/bookings endpoints your regular driver screens already call.
 *
 * Adjust the two imports below to your project's real paths/exports —
 * they're written to match what's visible in your compiled bundle
 * (driverTrips.active/enRoute/markReached/startWithOtp/complete) and App.js
 * (useSession), but I haven't seen these files directly.
 */
import { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity, TextInput, Alert, RefreshControl } from 'react-native';
import { driverTrips } from '../api/driverTrips';
import { useSession, logout } from '../store/session';

const ACTION_BY_STATUS = {
  ALLOCATED: { label: 'Start heading to pickup', next: (id) => driverTrips.enRoute(id) },
  EN_ROUTE:  { label: 'I have arrived at pickup', next: (id) => driverTrips.markReached(id) },
};

export function TemporaryDriverScreen() {
  const { assignedVehicle } = useSession(); // { registrationNumber, vehicleClass } — extend session.js to expose this from /driver/me
  const [trip, setTrip]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy]       = useState(false);
  const [otp, setOtp]         = useState('');
  const [otpError, setOtpError] = useState(null);

  const load = useCallback(async () => {
    try {
      const active = await driverTrips.active();
      setTrip(active || null);
    } catch (e) {
      setTrip(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  // Simple poll so a newly-dispatched trip appears without a manual pull-to-refresh.
  useEffect(() => {
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [load]);

  async function runAction(fn) {
    setBusy(true);
    try {
      await fn(trip.id);
      await load();
    } catch (e) {
      Alert.alert('Error', e.message || 'Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function verifyOtp() {
    const code = otp.trim();
    if (!/^\d{4}$/.test(code)) return setOtpError('Enter the 4-digit OTP from the customer.');
    setOtpError(null);
    setBusy(true);
    try {
      await driverTrips.startWithOtp(trip.id, code);
      setOtp('');
      await load();
    } catch (e) {
      setOtpError(e.code === 'OTP_INVALID' ? 'Incorrect OTP. Ask the customer to check again.' : (e.message || 'Could not verify OTP.'));
    } finally {
      setBusy(false);
    }
  }

  async function completeTrip() {
    setBusy(true);
    try {
      await driverTrips.complete(trip.id);
      await load();
    } catch (e) {
      Alert.alert('Error', e.message || 'Please try again.');
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.center}><ActivityIndicator size="large" color="#3B65DB" /></View>
    );
  }

  const action = trip ? ACTION_BY_STATUS[trip.status] : null;

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={false} onRefresh={load} />}>
      <View style={styles.vehicleCard}>
        <Text style={styles.vehicleLabel}>Your vehicle</Text>
        <Text style={styles.vehicleNumber}>{assignedVehicle?.registrationNumber || '—'}</Text>
        {assignedVehicle?.vehicleClass && <Text style={styles.vehicleClass}>{assignedVehicle.vehicleClass}</Text>}
      </View>

      {!trip && (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>No trip assigned right now</Text>
          <Text style={styles.emptyText}>This screen updates automatically once dispatch assigns a trip to your vehicle.</Text>
        </View>
      )}

      {trip && (
        <View style={styles.tripCard}>
          <Text style={styles.tripStatus}>{trip.status?.replace('_', ' ')}</Text>
          <Row label="Pickup" value={trip.pickup || trip.pickupAddress} />
          <Row label="Drop" value={trip.drop || trip.dropAddress} />
          <Row label="Customer" value={trip.customerName} />
          <Row label="Customer phone" value={trip.customerPhone} />
          {trip.estimatedFare != null && <Row label="Estimated fare" value={`₹${trip.estimatedFare}`} />}

          {action && (
            <TouchableOpacity style={[styles.button, busy && styles.buttonDisabled]} disabled={busy}
              onPress={() => runAction(action.next)}>
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>{action.label}</Text>}
            </TouchableOpacity>
          )}

          {trip.status === 'REACHED' && (
            <View style={styles.otpBlock}>
              <Text style={styles.otpHint}>Ask the customer for the 4-digit OTP sent to their phone.</Text>
              <TextInput style={styles.otpInput} value={otp} onChangeText={(t) => { setOtp(t.replace(/\D/g, '').slice(0, 4)); setOtpError(null); }}
                keyboardType="number-pad" maxLength={4} placeholder="0000" />
              {otpError && <Text style={styles.otpError}>{otpError}</Text>}
              <TouchableOpacity style={[styles.button, busy && styles.buttonDisabled]} disabled={busy} onPress={verifyOtp}>
                {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Verify OTP & Start Ride</Text>}
              </TouchableOpacity>
            </View>
          )}

          {trip.status === 'ONGOING' && (
            <TouchableOpacity style={[styles.button, busy && styles.buttonDisabled]} disabled={busy} onPress={completeTrip}>
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Complete Trip</Text>}
            </TouchableOpacity>
          )}
        </View>
      )}

      <TouchableOpacity style={styles.logout} onPress={logout}>
        <Text style={styles.logoutText}>Sign out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function Row({ label, value }) {
  if (!value) return null;
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

export default TemporaryDriverScreen;

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#F7F8FC' },
  container: { padding: 20, paddingTop: 60 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F7F8FC' },
  vehicleCard: { backgroundColor: '#fff', borderRadius: 16, padding: 20, marginBottom: 16, alignItems: 'center', borderWidth: 1, borderColor: '#E5E7EB' },
  vehicleLabel: { fontSize: 12.5, color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
  vehicleNumber: { fontSize: 28, fontWeight: '800', color: '#1F2937', letterSpacing: 1 },
  vehicleClass: { fontSize: 13, color: '#6B7280', marginTop: 4 },
  emptyCard: { backgroundColor: '#fff', borderRadius: 16, padding: 24, alignItems: 'center', borderWidth: 1, borderColor: '#E5E7EB' },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: '#1F2937', marginBottom: 6 },
  emptyText: { fontSize: 13, color: '#6B7280', textAlign: 'center', lineHeight: 18 },
  tripCard: { backgroundColor: '#fff', borderRadius: 16, padding: 20, borderWidth: 1, borderColor: '#E5E7EB' },
  tripStatus: { fontSize: 12.5, fontWeight: '800', color: '#3B65DB', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  rowLabel: { fontSize: 13, color: '#6B7280' },
  rowValue: { fontSize: 13.5, color: '#1F2937', fontWeight: '600', flexShrink: 1, textAlign: 'right', marginLeft: 12 },
  button: { backgroundColor: '#3B65DB', borderRadius: 10, padding: 14, alignItems: 'center', marginTop: 16 },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  otpBlock: { marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: '#F3F4F6' },
  otpHint: { fontSize: 13, color: '#6B7280', marginBottom: 10 },
  otpInput: { borderWidth: 1.5, borderColor: '#E5E7EB', borderRadius: 10, padding: 12, fontSize: 22, letterSpacing: 8, textAlign: 'center', fontWeight: '700', color: '#1F2937' },
  otpError: { color: '#DC2626', fontSize: 12.5, marginTop: 8 },
  logout: { alignItems: 'center', marginTop: 24, marginBottom: 20 },
  logoutText: { color: '#9CA3AF', fontSize: 13.5, fontWeight: '600' },
});
