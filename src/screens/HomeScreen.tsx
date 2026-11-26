// @ts-nocheck
/**
 * src/screens/HomeScreen.jsx
 *
 * CHANGES (all per Document A §22 and Document C):
 *   • offerApi, respondToOffer, recordAction, recentActionsSlice,
 *     OFFER_COUNTDOWN_SECONDS, startOfferCountdown, countdown UI — ALL REMOVED.
 *     Assignment is final (PD-2=A). offer:new = "you have been assigned".
 *   • Incoming offer card replaced with "Assigned Trip" card with single
 *     "Open Trip" CTA. No Accept/Decline, no countdown.
 *   • Active trip: reads distanceKm (not estimatedKm), finalFare ?? estimatedFare
 *     (not totalFare) — aligns with backend BOOKING_SELECT (F-7).
 *   • fetchActiveTrip → GET /driver/bookings/active via driverTrips (F-3/F-4).
 *   • GPS pinger receives getActiveBookingId() so each ping includes bookingId (F-5).
 *   • After assignment, socket.emit('booking:watch', bookingId) so trip:status
 *     and trip:location reach this driver (B-8 / Document C §11).
 *   • onTripStatus reads payload.bookingId not payload.id (F-6).
 *   • Vehicle feature flag (onboarding.vehicleFeatureAvailable) branch removed.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert, Linking, ScrollView, StyleSheet, Text, View,
  Pressable, ActivityIndicator, RefreshControl,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useDispatch, useSelector } from 'react-redux';
import {
  Wifi, WifiOff, MapPin, Navigation, Radio, Phone,
  Car, ShieldAlert, ShieldCheck, ChevronRight, CheckCircle2,
} from 'lucide-react-native';
import { colors, radius, spacing, type } from '../theme';
import { Button } from '../components/Button';
import { Card }   from '../components/Card';
import { locationApi } from '../api/endpoints';
import { driverTrips, unwrapBooking, TERMINAL_STATUSES } from '../api/driverTrips';
import {
  connectSocket, disconnectSocket,
  onOfferNew, onTripStatus, onPaymentReceived, watchBooking,
} from '../realtime/socket';
import { startLocationPinger, stopLocationPinger, ensureLocationPermission } from '../lib/locationPinger';
import { fetchActiveTrip, setActiveTrip, updateTripStatus, upsertTrip } from '../store/tripsSlice';
import { addNotification } from '../store/notificationsSlice';
import { setOnline } from '../store/driverStatusSlice';
import { useSession } from '../store/session';
import { store } from '../store/store';

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good Morning';
  if (h < 17) return 'Good Afternoon';
  return 'Good Evening';
}

function todayLabel() {
  return new Date().toLocaleDateString('en-IN', {
    weekday: 'long', day: 'numeric', month: 'long',
  });
}

const humanStatus = (s) => (s ? String(s).replace(/_/g, ' ') : '');

export function HomeScreen() {
  const navigation = useNavigation();
  const dispatch   = useDispatch();
  const { activeTrip, activeTripStatus } = useSelector((s) => s.trips);
  const online = useSelector((s) => s.driverStatus.isOnline);
  const { user, onboarding, refresh: refreshSession } = useSession();

  const [toggling,         setToggling]        = useState(false);
  const [assignedTrip,     setAssignedTrip]    = useState(null);
  const [loadingAssigned,  setLoadingAssigned] = useState(false);
  const [refreshing,       setRefreshing]      = useState(false);
  const lastSessionRefresh = useRef(0);

  // Re-check the active trip (and, at most every 30 s, the onboarding /
  // approval state) whenever Home comes into focus. Previously the active
  // trip was fetched once on mount, so after finishing a trip on TripScreen
  // the finished trip stayed on Home, and a newly approved vehicle wasn't
  // noticed until the app was restarted.
  useFocusEffect(
    useCallback(() => {
      dispatch(fetchActiveTrip());
      if (Date.now() - lastSessionRefresh.current > 30000) {
        lastSessionRefresh.current = Date.now();
        refreshSession().catch(() => {});
      }
    }, [dispatch, refreshSession]),
  );

  async function onPullRefresh() {
    setRefreshing(true);
    lastSessionRefresh.current = Date.now();
    await Promise.allSettled([dispatch(fetchActiveTrip()), refreshSession()]);
    setRefreshing(false);
  }

  // Stop GPS + socket when Home unmounts (logout / account deletion).
  useEffect(() => () => {
    stopLocationPinger();
    disconnectSocket();
  }, []);

  // ── Realtime handlers ─────────────────────────────────────────────────────
  // Registered ONCE for the lifetime of the screen and removed on unmount.
  // They used to be added inside toggleOnline(), with the unsubscribe
  // functions thrown away — every Go Online tap stacked another full set, so
  // each event produced duplicate notifications and duplicate fetches.
  useEffect(() => {
    const offOffer = onOfferNew(async (payload) => {
      const { bookingId, allocationId } = payload || {};
      if (!bookingId) return;
      watchBooking(bookingId);
      dispatch(addNotification({
        type: 'TRIP',
        title: 'New trip assigned',
        body: `Booking #${String(bookingId).slice(0, 8)}`,
      }));
      setLoadingAssigned(true);
      try {
        const b = unwrapBooking(await driverTrips.getById(bookingId));
        setAssignedTrip({ bookingId, allocationId, booking: b });
        if (b) dispatch(setActiveTrip(b));
      } catch {
        setAssignedTrip({ bookingId, allocationId, booking: null });
      } finally {
        setLoadingAssigned(false);
      }
    });

    const offStatus = onTripStatus((payload) => {
      const { bookingId, status } = payload || {};
      if (!bookingId || !status) return;
      // Only touches the matching booking. This used to overwrite activeTrip
      // with `{ ...activeTrip, id: bookingId, status }` for ANY booking's
      // event — grafting one trip's id onto another trip's addresses/fare.
      dispatch(updateTripStatus({ bookingId, status }));
      dispatch(addNotification({ type: 'TRIP', title: 'Trip status update', body: humanStatus(status) }));
      if (TERMINAL_STATUSES.includes(status)) {
        setAssignedTrip((cur) => (cur?.bookingId === bookingId ? null : cur));
      } else if (!store.getState().trips.activeTrip) {
        dispatch(fetchActiveTrip());
      }
    });

    const offPayment = onPaymentReceived(async (payload) => {
      const { bookingId, amount, balanceDue } = payload || {};
      dispatch(addNotification({
        type: 'PAYMENT',
        title: 'Payment received',
        body: `₹${amount ?? 0} received` + (balanceDue > 0 ? ` — ₹${balanceDue} still due` : ''),
      }));
      if (!bookingId) return;
      try {
        const b = unwrapBooking(await driverTrips.getById(bookingId));
        if (b) dispatch(upsertTrip(b)); // updates activeTrip only if it IS this booking
      } catch { /* best-effort */ }
    });

    return () => { offOffer(); offStatus(); offPayment(); };
  }, [dispatch]);

  // Keep the live trip's booking room joined (also after app restarts, when
  // the trip comes from GET /driver/bookings/active rather than offer:new).
  useEffect(() => {
    if (online && activeTrip?.id) watchBooking(activeTrip.id);
  }, [online, activeTrip?.id]);

  // Hide the "assigned" card once that trip is no longer the live trip.
  useEffect(() => {
    if (assignedTrip && activeTripStatus === 'succeeded' && activeTrip?.id !== assignedTrip.bookingId && !loadingAssigned) {
      setAssignedTrip(null);
    }
  }, [activeTrip?.id, activeTripStatus]);

  // ── Eligibility ───────────────────────────────────────────────────────────
  const vehicles = onboarding?.vehicles || [];
  const approvedVehicle = vehicles.find((v) => v.status === 'APPROVED');
  const primaryVehicle  = approvedVehicle || vehicles[0] || null;
  const primaryRegNo    = primaryVehicle?.vehicle?.registrationNumber || primaryVehicle?.registrationNumber;
  const isEligible      = onboarding?.isApproved === true;

  // ── Online toggle ─────────────────────────────────────────────────────────
  async function goOffline() {
    await locationApi.goOffline();
    stopLocationPinger();
    disconnectSocket();
    dispatch(setOnline(false));
    setAssignedTrip(null);
  }

  async function goOnline() {
    // Ask for location BEFORE telling the server we're online — previously
    // the server was told "online" first and then, if permission was denied,
    // a second call tried to undo it.
    if (!(await ensureLocationPermission())) {
      Alert.alert('Location permission needed', 'Please allow location access to go online.');
      return;
    }
    await locationApi.goOnline();
    try {
      const ok = await startLocationPinger(() => store.getState().trips.activeTrip?.id ?? null);
      if (!ok) throw new Error('Location permission is required to go online.');
      await connectSocket();
      const live = store.getState().trips.activeTrip;
      if (live?.id) watchBooking(live.id);
      dispatch(setOnline(true));
    } catch (err) {
      // Roll back so the server doesn't keep dispatching to a driver whose
      // app isn't listening.
      stopLocationPinger();
      disconnectSocket();
      locationApi.goOffline().catch(() => {});
      throw err;
    }
  }

  async function toggleOnline() {
    if (toggling) return;
    if (!online && !isEligible) {
      Alert.alert(
        'Not eligible to go online yet',
        !onboarding?.hasVehicle
          ? 'Add a vehicle from Profile → My Vehicles, then wait for approval.'
          : 'Your vehicle is still awaiting approval.',
      );
      return;
    }
    setToggling(true);
    try {
      if (online) await goOffline();
      else await goOnline();
    } catch (err) {
      Alert.alert("Couldn't update status", err?.message || 'Please try again.');
    } finally {
      setToggling(false);
    }
  }

  function openMaps(address) {
    const q = encodeURIComponent(
      typeof address === 'object' ? (address?.address || '') : (address || '')
    );
    if (q) Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${q}`).catch(() => {});
  }

  const trip   = activeTrip;
  const pickup = trip?.pickup?.address  || trip?.pickupAddress?.address  || trip?.pickupAddress  || '';
  const drop   = trip?.drop?.address    || trip?.dropAddress?.address    || trip?.dropAddress    || '';
  // Use corrected field names per Document C §6
  const distKm = trip?.distanceKm ?? trip?.estimatedKm ?? null;
  const fare   = trip?.finalFare   ?? trip?.estimatedFare ?? null;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onPullRefresh} tintColor={colors.primary} colors={[colors.primary]} />}
    >

      {/* ── Header ── */}
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.greeting}>
            {greeting()}{user?.name ? `, ${user.name.split(' ')[0]}` : ''}
          </Text>
          <Text style={styles.headerDate}>{todayLabel()}</Text>
        </View>
      </View>

      {/* ── Vehicle status ── */}
      <Card Icon={Car} title="Vehicle">
        {!onboarding?.hasVehicle ? (
          <View>
            <Text style={styles.vehicleMuted}>No vehicle added</Text>
            <Button
              label="Add Vehicle"
              Icon={Car}
              IconRight={ChevronRight}
              variant="secondary"
              flex={false}
              style={styles.addVehicleBtn}
              onPress={() => navigation.navigate('RegisterVehicle')}
            />
          </View>
        ) : primaryVehicle?.status === 'APPROVED' ? (
          <View style={styles.vehicleRow}>
            <ShieldCheck size={16} color={colors.success} />
            <View style={{ flex: 1 }}>
              <Text style={styles.vehicleNumber}>
                {primaryRegNo || '—'}
              </Text>
              <Text style={styles.vehicleApproved}>Approved</Text>
            </View>
          </View>
        ) : (
          <View style={styles.vehicleRow}>
            <ShieldAlert size={16} color={colors.textMuted} />
            <Text style={styles.vehicleMuted}>Vehicle verification pending</Text>
          </View>
        )}
      </Card>

      {/* ── Online / Offline toggle ── */}
      <View style={[styles.card, styles.statusCard, online && styles.statusCardOnline]}>
        {online
          ? <Wifi    size={40} color={colors.success} />
          : <WifiOff size={40} color={colors.textMuted} />
        }
        <Text style={styles.statusLabel}>{online ? 'You are Online' : 'You are Offline'}</Text>
        <Text style={styles.statusSub}>
          {online
            ? 'Waiting for trip assignments…'
            : isEligible
              ? 'Tap to start receiving trips'
              : 'Complete vehicle approval to go online'}
        </Text>
        <Button
          label={toggling ? 'Updating…' : online ? 'Go Offline' : 'Go Online'}
          variant={online ? 'danger' : 'primary'}
          Icon={online ? WifiOff : Wifi}
          onPress={toggleOnline}
          loading={toggling}
          flex={false}
          style={styles.toggleBtn}
        />
        {online && (
          <View style={styles.liveRow}>
            <Radio size={12} color={colors.success} />
            <Text style={styles.liveText}>GPS tracking active</Text>
          </View>
        )}
      </View>

      {/* ── Assigned trip card (replaces offer card) ── */}
      {(assignedTrip || loadingAssigned) && (
        <View style={[styles.card, styles.assignedCard]}>
          <View style={styles.assignedBadge}>
            <Text style={styles.assignedBadgeText}>🚗 TRIP ASSIGNED</Text>
          </View>

          {loadingAssigned ? (
            <ActivityIndicator color={colors.primary} style={{ marginVertical: spacing.md }} />
          ) : assignedTrip?.booking ? (
            <>
              <View style={styles.routeBox}>
                <Pressable
                  style={styles.routeRow}
                  onPress={() => openMaps(assignedTrip.booking.pickup || assignedTrip.booking.pickupAddress)}
                >
                  <MapPin size={15} color={colors.success} />
                  <Text style={styles.routeText} numberOfLines={2}>
                    {assignedTrip.booking.pickup?.address || assignedTrip.booking.pickupAddress?.address || assignedTrip.booking.pickupAddress || '—'}
                  </Text>
                  <Navigation size={13} color={colors.primary} />
                </Pressable>
                <View style={styles.routeDivider} />
                <Pressable
                  style={styles.routeRow}
                  onPress={() => openMaps(assignedTrip.booking.drop || assignedTrip.booking.dropAddress)}
                >
                  <MapPin size={15} color={colors.danger} />
                  <Text style={styles.routeText} numberOfLines={2}>
                    {assignedTrip.booking.drop?.address || assignedTrip.booking.dropAddress?.address || assignedTrip.booking.dropAddress || '—'}
                  </Text>
                  <Navigation size={13} color={colors.primary} />
                </Pressable>
              </View>

              {/* Customer call */}
              {!!assignedTrip.booking.customer?.phone && (
                <View style={styles.customerRow}>
                  <Phone size={14} color={colors.primary} />
                  <Text style={styles.customerName}>
                    {assignedTrip.booking.customer?.name || 'Customer'}
                  </Text>
                  <Pressable
                    onPress={() => Linking.openURL(`tel:${assignedTrip.booking.customer.phone}`).catch(() => {})}
                    style={styles.callBtn}
                  >
                    <Text style={styles.callBtnText}>Call</Text>
                  </Pressable>
                </View>
              )}

              <View style={styles.tripMeta}>
                {(assignedTrip.booking.distanceKm ?? assignedTrip.booking.estimatedKm) != null && (
                  <MetaItem label="Distance" value={`${assignedTrip.booking.distanceKm ?? assignedTrip.booking.estimatedKm} km`} />
                )}
                {(assignedTrip.booking.finalFare ?? assignedTrip.booking.estimatedFare) != null && (
                  <MetaItem label="Est. fare" value={`₹${assignedTrip.booking.finalFare ?? assignedTrip.booking.estimatedFare}`} />
                )}
                <MetaItem label="Status" value="ASSIGNED" highlight />
              </View>
            </>
          ) : (
            <Text style={styles.vehicleMuted}>Loading trip details…</Text>
          )}

          {/* Single CTA — no accept/decline. Disabled while the assignment
              is still loading (assignedTrip is null then and this crashed). */}
          {assignedTrip?.bookingId && (
            <Button
              label="Open Trip"
              Icon={Navigation}
              flex={false}
              style={styles.openTripBtn}
              onPress={() => navigation.navigate('Trip', { bookingId: assignedTrip.bookingId })}
            />
          )}
        </View>
      )}

      {/* ── Active trip card ── */}
      {activeTripStatus === 'loading' && !activeTrip && !assignedTrip && (
        <View style={styles.card}>
          <ActivityIndicator color={colors.primary} />
        </View>
      )}

      {activeTrip && !assignedTrip && (
        <View style={[styles.card, styles.activeTripCard]}>
          <View style={styles.tripBadge}>
            <Text style={styles.tripBadgeText}>
              {activeTrip.status === 'ONGOING' ? '🚗 TRIP IN PROGRESS' : '📋 ACTIVE TRIP'}
            </Text>
          </View>

          <View style={styles.routeBox}>
            <Pressable style={styles.routeRow} onPress={() => openMaps(pickup)}>
              <MapPin size={15} color={colors.success} />
              <Text style={styles.routeText} numberOfLines={2}>{pickup || '—'}</Text>
              <Navigation size={13} color={colors.primary} />
            </Pressable>
            <View style={styles.routeDivider} />
            <Pressable style={styles.routeRow} onPress={() => openMaps(drop)}>
              <MapPin size={15} color={colors.danger} />
              <Text style={styles.routeText} numberOfLines={2}>{drop || '—'}</Text>
              <Navigation size={13} color={colors.primary} />
            </Pressable>
          </View>

          {!!activeTrip.customer?.phone && (
            <View style={styles.customerRow}>
              <Phone size={14} color={colors.primary} />
              <Text style={styles.customerName}>
                {activeTrip.customer?.name || activeTrip.customer?.user?.name || 'Customer'}
              </Text>
              <Pressable
                onPress={() => Linking.openURL(`tel:${activeTrip.customer.phone}`).catch(() => {})}
                style={styles.callBtn}
              >
                <Text style={styles.callBtnText}>Call</Text>
              </Pressable>
            </View>
          )}

          <View style={styles.tripMeta}>
            {distKm != null && <MetaItem label="Distance" value={`${distKm} km`} />}
            {fare    != null && <MetaItem label="Fare"     value={`₹${fare}`} />}
            <MetaItem label="Status" value={humanStatus(activeTrip.status)} highlight />
          </View>

          <Button
            label="Open Trip Details"
            Icon={Navigation}
            flex={false}
            style={styles.openTripBtn}
            onPress={() => navigation.navigate('Trip', { bookingId: activeTrip.id })}
          />
        </View>
      )}

      {/* ── Offline hint ── */}
      {!online && !assignedTrip && !activeTrip && activeTripStatus !== 'loading' && (
        <View style={styles.hintBox}>
          <WifiOff size={40} color={colors.border} />
          <Text style={styles.hint}>
            {isEligible
              ? 'Go online to start receiving trip assignments.'
              : 'Complete vehicle approval to start receiving trips.'}
          </Text>
        </View>
      )}

      {/* Verified CTA badge */}
      {online && !activeTrip && !assignedTrip && activeTripStatus !== 'loading' && (
        <View style={styles.readyBadge}>
          <CheckCircle2 size={16} color={colors.success} />
          <Text style={styles.readyText}>Ready for assignments</Text>
        </View>
      )}

    </ScrollView>
  );
}

function MetaItem({ label, value, highlight }) {
  return (
    <View style={metaStyles.item}>
      <Text style={metaStyles.label}>{label}</Text>
      <Text style={[metaStyles.value, highlight && { color: colors.primary }]}>{value}</Text>
    </View>
  );
}

const metaStyles = StyleSheet.create({
  item:  { flex: 1, backgroundColor: colors.background, borderRadius: radius.md, padding: spacing.sm, alignItems: 'center' },
  label: { fontSize: 10, color: colors.textMuted },
  value: { fontSize: 13, fontWeight: '700', color: colors.text, marginTop: 2 },
});

const styles = StyleSheet.create({
  container:       { flex: 1, backgroundColor: colors.background },
  content:         { padding: spacing.lg },
  greeting:        { ...type.h1, color: colors.text },
  headerRow:       { marginBottom: spacing.lg },
  headerDate:      { fontSize: 13, color: colors.textMuted, marginTop: 2 },

  vehicleRow:      { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  vehicleMuted:    { fontSize: 13, color: colors.textMuted },
  vehicleNumber:   { fontSize: 15, fontWeight: '700', color: colors.text },
  vehicleApproved: { fontSize: 12, color: colors.success, fontWeight: '600' },
  addVehicleBtn:   { alignSelf: 'flex-start', marginTop: spacing.sm },

  card:            { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.lg, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2 },
  statusCard:      { alignItems: 'center' },
  statusCardOnline:{ borderColor: colors.success, backgroundColor: '#F3FBF4' },
  statusLabel:     { ...type.h2, color: colors.text, marginTop: spacing.sm },
  statusSub:       { ...type.caption, color: colors.textMuted, marginBottom: spacing.md, textAlign: 'center' },
  toggleBtn:       { minWidth: 160 },
  liveRow:         { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing.sm },
  liveText:        { fontSize: 12, color: colors.success, fontWeight: '600' },

  assignedCard:    { borderWidth: 2, borderColor: colors.primary, backgroundColor: '#FFFDE7' },
  assignedBadge:   { backgroundColor: colors.primary, alignSelf: 'flex-start', borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 3, marginBottom: spacing.md },
  assignedBadgeText:{ fontSize: 11, fontWeight: '700', color: colors.primaryText },

  activeTripCard:  { borderColor: colors.primary, borderWidth: 2 },
  tripBadge:       { backgroundColor: colors.primary, alignSelf: 'flex-start', borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 3, marginBottom: spacing.md },
  tripBadgeText:   { fontSize: 11, fontWeight: '700', color: colors.primaryText },

  routeBox:        { backgroundColor: colors.background, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.md },
  routeRow:        { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  routeText:       { flex: 1, fontSize: 13, color: colors.text },
  routeDivider:    { height: 1, backgroundColor: colors.border, marginVertical: spacing.sm, marginLeft: 22 },

  customerRow:     { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: spacing.sm, marginBottom: spacing.md },
  customerName:    { flex: 1, fontSize: 13, fontWeight: '700', color: colors.text },
  callBtn:         { backgroundColor: colors.primary, borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 4 },
  callBtnText:     { color: colors.primaryText, fontWeight: '700', fontSize: 12 },

  tripMeta:        { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  openTripBtn:     { alignSelf: 'stretch' },

  hintBox:         { alignItems: 'center', marginTop: spacing.xl, gap: spacing.md },
  hint:            { ...type.caption, color: colors.textMuted, textAlign: 'center' },

  readyBadge:      { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, justifyContent: 'center', marginTop: spacing.lg },
  readyText:       { fontSize: 13, color: colors.success, fontWeight: '700' },
});
