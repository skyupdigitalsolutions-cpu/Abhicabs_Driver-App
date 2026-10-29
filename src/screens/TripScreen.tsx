// @ts-nocheck
/**
 * src/screens/TripScreen.jsx
 *
 * CHANGES:
 *   • loadBooking → GET /driver/bookings/:id via driverTrips (B-4/SEC-1).
 *   • Fare breakdown: baseFare/tax/totalFare/estimatedKm → distanceKm/estimatedFare/finalFare (F-7).
 *   • Full driver lifecycle buttons added (B-5=A):
 *       ALLOCATED → [En-Route] → EN_ROUTE
 *       EN_ROUTE  → [Arrived at Pickup] → REACHED
 *       REACHED   → [Verify OTP + Start] → ONGOING  ← NEW OTP system
 *       ARRIVED   → [Complete Trip] → COMPLETED
 *   • OTP system (like Uber/Rapido):
 *       When driver taps "Arrived at Pickup" (markReached), the backend
 *       generates a 6-digit OTP and sends it to the customer (email/push).
 *       The driver screen then shows an OTP entry field.
 *       The driver asks the customer for their OTP and enters it.
 *       Submitting calls POST /driver/bookings/:id/start { otp }.
 *       Mismatch → OTP_INVALID error shown inline. Match → trip starts.
 *   • "Complete Trip" button now calls POST /driver/bookings/:id/complete,
 *     not just the odometer endpoint (which is a record, not a completion).
 *   • Collect cash button shown when balanceDue > 0 and status ∈ ARRIVED|COMPLETED.
 *   • Live socket updates via trip:status (needs B-8 on backend).
 */
import { useCallback, useEffect, useState, useRef } from 'react';
import {
  Alert, Image, KeyboardAvoidingView, Linking, Platform, Pressable, RefreshControl,
  ScrollView, StyleSheet, Text, TextInput, View, ActivityIndicator,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useDispatch } from 'react-redux';
import {
  MapPin, Navigation, Phone, AlertTriangle, CheckCircle2,
  Gauge, Milestone, User, Camera, ImageIcon, Info,
  Flag, Play, Key, DollarSign, Star,
} from 'lucide-react-native';
import { colors, radius, spacing, type } from '../theme';
import { Card }             from '../components/Card';
import { Button }           from '../components/Button';
import { TripMap }          from '../components/TripMap';
import { driverTrips, unwrapBooking } from '../api/driverTrips';
import { onTripStatus, onPaymentReceived, watchBooking } from '../realtime/socket';
import { promptForImage }   from '../lib/imagePicker';
import { fetchActiveTrip, upsertTrip, updateTripStatus } from '../store/tripsSlice';
import { SUPPORT_PHONE }    from '../config';

// Authoritative status order (Document C §1, B-6 fix: REACHED is non-terminal)
// Displayed progress steps. EN_ROUTE is deliberately NOT shown: the driver
// now marks themselves at the pickup directly from ALLOCATED (the backend
// accepts ALLOCATED -> REACHED), so the extra "start heading to pickup" tap
// is gone. EN_ROUTE still exists server-side — dispatch can set it and older
// bookings are already in it — so STEP_POSITION maps it onto the ALLOCATED
// slot rather than falling off the bar.
const STATUS_STEPS = ['ALLOCATED', 'REACHED', 'ONGOING', 'ARRIVED', 'COMPLETED'];

const STEP_POSITION = {
  ALLOCATED: 0,
  EN_ROUTE:  0, // legacy / dispatch-set: still "heading to pickup"
  REACHED:   1,
  ONGOING:   2,
  ARRIVED:   3,
  COMPLETED: 4,
};

// Driver-facing labels. The raw enum names were rendered directly with
// `step.replace('_', '\n')`, which put a newline inside "EN_ROUTE" while
// numberOfLines={1} forced a single line — so that step collapsed to a
// literal "..." on screen.
const STATUS_LABELS = {
  ALLOCATED: 'Allocated',
  REACHED:   'At pickup',
  ONGOING:   'Trip begins',
  ARRIVED:   'At drop',
  COMPLETED: 'Completed',
};

// Trip start OTP length — must match backend tripOtp.service OTP_LENGTH (6).
const OTP_LENGTH = 6;
const OTP_RE = new RegExp(`^\\d{${OTP_LENGTH}}$`);
const KM_RE = /^\d+(\.\d+)?$/;

/**
 * The start-of-trip odometer the backend stored (sent with /start). The field
 * name isn't part of the documented booking shape, so accept the usual ones.
 * Returns a number or null.
 */
function startOdometerOf(booking) {
  const v = booking?.startOdometerKm ?? booking?.odometerStartKm ?? booking?.startOdometer
    ?? booking?.odometerStart ?? booking?.startKm ?? booking?.trip?.startOdometerKm;
  const n = Number(v);
  return v != null && v !== '' && Number.isFinite(n) ? n : null;
}

const fmtMoney = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n.toLocaleString('en-IN', { maximumFractionDigits: 2 }) : '—';
};

export function TripScreen() {
  const route      = useRoute();
  const navigation = useNavigation();
  const dispatch   = useDispatch();
  const bookingId  = route.params?.bookingId;

  const [booking,          setBooking]          = useState(null);
  const [loadStatus,       setLoadStatus]       = useState('loading');

  // Lifecycle action states
  const [actioning,        setActioning]        = useState(false);

  // OTP states — shown after driver marks "Reached pickup"
  const [showOtpEntry,     setShowOtpEntry]     = useState(false);
  // Odometer captured at trip START — see handleVerifyOtpAndStart.
  const [startOdometer,      setStartOdometer]      = useState('');
  const [startOdometerPhoto, setStartOdometerPhoto] = useState(null);
  const [otpValue,         setOtpValue]         = useState('');
  const [otpError,         setOtpError]         = useState(null);
  const [verifyingOtp,     setVerifyingOtp]     = useState(false);
  const otpRef = useRef(null);

  // Start reading typed on THIS device — fallback for the end-reading check
  // if the booking payload doesn't echo the stored start reading back.
  const [startReadingLocal, setStartReadingLocal] = useState(null);
  const [refreshing,        setRefreshing]        = useState(false);

  // Odometer states
  const [odometerKm,       setOdometerKm]       = useState('');
  const [odometerError,    setOdometerError]    = useState(null);
  const [odometerPhoto,    setOdometerPhoto]    = useState(null);
  const [submittingOdo,    setSubmittingOdo]    = useState(false);
  const [odoRecorded,      setOdoRecorded]      = useState(false);

  // Cash collect
  const [collectingCash,   setCollectingCash]   = useState(false);

  // Complete trip
  const [completing,       setCompleting]       = useState(false);

  // ── Data load ─────────────────────────────────────────────────────────────
  // `silent` reloads keep the screen on display. Every action used to call a
  // reload that swapped the whole screen for a spinner (scroll position lost,
  // map re-initialised) and, if that reload failed, showed "Trip not found"
  // even though the action had succeeded.
  const loadBooking = useCallback(async ({ silent = false } = {}) => {
    if (!bookingId) { setLoadStatus('error'); return; }
    if (!silent) setLoadStatus('loading');
    try {
      const b = unwrapBooking(await driverTrips.getById(bookingId));
      if (!b) throw new Error('not found');
      setBooking(b);
      setLoadStatus('ready');
      dispatch(upsertTrip(b)); // keep Home / Trips list in sync
    } catch (err) {
      // 404 = not allocated to this driver, or booking doesn't exist (SEC-1)
      if (!silent) setLoadStatus(err?.status === 404 || err?.message === 'not found' ? 'notfound' : 'error');
    }
  }, [bookingId, dispatch]);

  useEffect(() => {
    loadBooking();
    // Join booking room for live status updates (B-8). Remembered and joined
    // when the socket connects if the driver isn't online yet.
    if (bookingId) watchBooking(bookingId);
  }, [bookingId, loadBooking]);

  // Live updates for this booking.
  useEffect(() => {
    const offStatus = onTripStatus((payload) => {
      if (payload?.bookingId !== bookingId) return;
      setBooking((prev) => (prev ? { ...prev, status: payload.status } : prev));
      if (payload.status !== 'REACHED') {
        setShowOtpEntry(false);
        setOtpValue('');
        setOtpError(null);
      }
      loadBooking({ silent: true }); // fares/balance may have changed too
    });
    const offPayment = onPaymentReceived((payload) => {
      if (payload?.bookingId === bookingId) loadBooking({ silent: true });
    });
    return () => { offStatus(); offPayment(); };
  }, [bookingId, loadBooking]);

  /** After any successful lifecycle action: reload this trip + the global active trip. */
  function afterAction(newStatus) {
    if (newStatus) dispatch(updateTripStatus({ bookingId, status: newStatus }));
    loadBooking({ silent: true });
    dispatch(fetchActiveTrip());
  }

  async function onPullRefresh() {
    setRefreshing(true);
    await loadBooking({ silent: true });
    setRefreshing(false);
  }

  // ── Lifecycle: ALLOCATED → EN_ROUTE ──────────────────────────────────────
  // handleEnRoute() was removed with the "Start heading to pickup" button —
  // the driver now goes ALLOCATED -> REACHED in one step. driverTrips.enRoute()
  // is left in the API layer because dispatch still uses that transition.

  // ── Lifecycle: ALLOCATED | EN_ROUTE → REACHED ────────────────────────────
  // After this, the backend generates the customer OTP and delivers it via email/push.
  async function handleReached() {
    setActioning(true);
    try {
      await driverTrips.markReached(bookingId);
      // OTP has been sent to the customer — show the entry field
      setBooking((prev) => (prev ? { ...prev, status: 'REACHED' } : prev));
      setShowOtpEntry(true);
      setOtpValue('');
      setOtpError(null);
      Alert.alert(
        'Arrived at pickup ✓',
        `The customer has been sent a ${OTP_LENGTH}-digit OTP. Ask them for it to start the ride.`,
        [{ text: 'Enter OTP', onPress: () => otpRef.current?.focus() }]
      );
      afterAction('REACHED');
    } catch (err) {
      Alert.alert('Error', err.message || 'Please try again.');
    } finally {
      setActioning(false);
    }
  }

  // ── OTP verify + start trip: REACHED → ONGOING ───────────────────────────
  // OTP is the 6-digit code the customer reads from their email/app.
  // Like Uber/Rapido: driver enters customer's OTP to confirm they're in the car.
  async function handleVerifyOtpAndStart() {
    if (verifyingOtp) return;
    const trimmedOtp = otpValue.trim();
    if (!OTP_RE.test(trimmedOtp)) {
      setOtpError(`Enter the ${OTP_LENGTH}-digit OTP from the customer.`);
      return;
    }
    // Start odometer is required: an end reading is meaningless without one to
    // measure against. Photo is optional but strongly encouraged as proof.
    const startTrim = startOdometer.trim();
    const km = Number(startTrim);
    if (!KM_RE.test(startTrim) || !Number.isFinite(km) || km <= 0) {
      setOtpError('Enter the current odometer reading before starting.');
      return;
    }
    setOtpError(null);
    setVerifyingOtp(true);
    try {
      await driverTrips.startWithOtp(bookingId, trimmedOtp, km);
      setStartReadingLocal(km);
      setBooking((prev) => (prev ? { ...prev, status: 'ONGOING' } : prev));

      // Photo is recorded AFTER the status change, because the backend only
      // accepts an odometer photo once the trip is ONGOING. A failure here
      // must not read as "trip didn't start" — it did.
      if (startOdometerPhoto) {
        try {
          await driverTrips.recordOdometer(bookingId, km, startOdometerPhoto);
        } catch {
          Alert.alert(
            'Trip started — photo not saved',
            'The trip is running, but the start odometer photo could not be uploaded. The reading itself was saved.',
          );
        }
      }

      setShowOtpEntry(false);
      setOtpValue('');
      setStartOdometer('');
      setStartOdometerPhoto(null);
      Alert.alert('Trip started! 🚗', 'OTP verified. Safe journey!');
      afterAction('ONGOING');
    } catch (err) {
      // Backend returns OTP_INVALID on mismatch (older builds: INVALID_OTP),
      // OTP_EXPIRED if the window passed.
      if (err.code === 'OTP_INVALID' || err.code === 'INVALID_OTP') {
        setOtpError('Incorrect OTP. Ask the customer to check their email/app again.');
      } else if (err.code === 'OTP_EXPIRED') {
        setOtpError('OTP expired. Ask the customer for a new one (tap "Arrived at Pickup" again).');
      } else {
        setOtpError(err.message || 'Could not verify OTP. Please try again.');
      }
    } finally {
      setVerifyingOtp(false);
    }
  }

  // ── Lifecycle: ONGOING → ARRIVED (at drop-off) ───────────────────────────
  // Missing piece: complete() requires ARRIVED, but nothing previously ever
  // set it — a trip that reached ONGOING could never be completed.
  const [markingArrived, setMarkingArrived] = useState(false);
  async function handleArrived() {
    setMarkingArrived(true);
    try {
      await driverTrips.arrived(bookingId);
      setBooking((prev) => (prev ? { ...prev, status: 'ARRIVED' } : prev));
      Alert.alert('Arrived at destination ✓', 'Record the final odometer reading and complete the trip below.');
      afterAction('ARRIVED');
    } catch (err) {
      Alert.alert('Error', err.message || 'Please try again.');
    } finally {
      setMarkingArrived(false);
    }
  }

  // ── Collect cash (ARRIVED | COMPLETED, balanceDue > 0) ───────────────────
  async function handleCollectCash() {
    setCollectingCash(true);
    try {
      const result = await driverTrips.collectCash(bookingId);
      const collected = result?.collected ?? result?.amount ?? booking?.balanceDue;
      const remaining = result?.balanceDue ?? result?.booking?.balanceDue ?? 0;
      Alert.alert(
        'Cash collected ✓',
        `Collected ₹${fmtMoney(collected)}. Balance due: ₹${fmtMoney(remaining)}`,
      );
      afterAction();
    } catch (err) {
      Alert.alert('Error', err.message || 'Please try again.');
    } finally {
      setCollectingCash(false);
    }
  }

  // ── Odometer photo pickers (end / start) ─────────────────────────────────
  function pickOdometerPhoto() {
    promptForImage({
      title: 'Odometer Photo',
      message: 'Take or choose a clear photo of the odometer reading',
      onPicked: (uri) => setOdometerPhoto({ uri }),
    });
  }

  function pickStartOdometerPhoto() {
    promptForImage({
      title: 'Odometer Photo',
      message: 'Take a clear photo of the odometer before you set off',
      onPicked: (uri) => setStartOdometerPhoto(uri),
    });
  }

  /**
   * Validate the end reading. Returns { km, actualKm } or null (error set).
   * actualKm = end − start when the start reading is known.
   */
  function readEndOdometer() {
    const trimmed = odometerKm.trim();
    if (!trimmed) { setOdometerError('Final KM is required.'); return null; }
    const km = Number(trimmed);
    if (!KM_RE.test(trimmed) || !Number.isFinite(km)) { setOdometerError('Enter a valid number.'); return null; }
    if (km <= 0) { setOdometerError('Final KM must be greater than zero.'); return null; }
    const start = startOdometerOf(booking) ?? startReadingLocal;
    if (start != null && km < start) {
      setOdometerError(`Final reading can't be less than the start reading (${start} km).`);
      return null;
    }
    setOdometerError(null);
    return { km, actualKm: start != null ? Math.round((km - start) * 10) / 10 : null };
  }

  // ── Odometer submit (ARRIVED | COMPLETED) ────────────────────────────────
  // This is a RECORD — it does NOT complete the trip. Use Complete Trip for that.
  async function submitOdometer() {
    if (submittingOdo) return;
    const reading = readEndOdometer();
    if (!reading) return;
    const { km } = reading;
    setSubmittingOdo(true);
    try {
      await driverTrips.recordOdometer(bookingId, km, odometerPhoto?.uri || null);
      setOdoRecorded(true);
      Alert.alert('Odometer recorded ✓', `Reading: ${km} km submitted.`);
      afterAction();
    } catch (err) {
      const msg = err.message || 'Please try again.';
      setOdometerError(msg);
      Alert.alert("Couldn't record", msg);
    } finally {
      setSubmittingOdo(false);
    }
  }

  // ── Complete trip: ARRIVED → COMPLETED ───────────────────────────────────
  async function handleComplete() {
    if (completing) return;
    // The end reading is optional here (it may have been recorded already),
    // but if one is typed it must be valid.
    let payload = {};
    if (odometerKm.trim()) {
      const reading = readEndOdometer();
      if (!reading) return;
      // FIX: this used to send the raw odometer READING as `actualKm` (the
      // distance driven) — e.g. 45 210 km for a 30 km trip — which the
      // backend uses to recompute the fare. actualKm is now end − start, and
      // is omitted when the start reading isn't known (the backend has it).
      payload = { odometerKm: reading.km };
      if (reading.actualKm != null) payload.actualKm = reading.actualKm;
    }
    Alert.alert(
      'Complete Trip',
      'This will finalise the trip, generate the invoice, and release the vehicle. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Complete',
          onPress: async () => {
            setCompleting(true);
            try {
              await driverTrips.complete(bookingId, payload);
              setBooking((prev) => (prev ? { ...prev, status: 'COMPLETED' } : prev));
              afterAction('COMPLETED');
              const customerName = booking?.customer?.name || booking?.customer?.user?.name || 'the customer';
              Alert.alert('Trip completed! 🎉', 'Invoice generated. Vehicle released.', [
                { text: 'Later', style: 'cancel' },
                {
                  text: 'Rate customer',
                  onPress: () => navigation.navigate('RateCustomer', { bookingId, customerName }),
                },
              ]);
            } catch (err) {
              if (err.code === 'PAYMENT_REQUIRED') {
                Alert.alert(
                  'Payment required',
                  'Collect the outstanding cash amount before completing.',
                );
                loadBooking({ silent: true }); // show the up-to-date balance
              } else {
                Alert.alert('Error', err.message || 'Please try again.');
              }
            } finally {
              setCompleting(false);
            }
          },
        },
      ]
    );
  }

  function openInMaps(address) {
    const q = encodeURIComponent(
      typeof address === 'object' ? (address?.address || '') : (address || '')
    );
    if (q) Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${q}`).catch(() => {});
  }

  function callCustomer() {
    const phone = booking?.customer?.phone || booking?.customer?.user?.phone;
    if (phone) Linking.openURL(`tel:${phone}`).catch(() => {});
    else Alert.alert('No phone', 'Customer phone number not available.');
  }

  // ── Loading / error states ────────────────────────────────────────────────
  if (loadStatus === 'loading') return (
    <View style={styles.center}><ActivityIndicator size="large" color={colors.primary} /></View>
  );

  if (loadStatus !== 'ready' || !booking) return (
    <View style={styles.center}>
      {loadStatus === 'notfound' ? (
        <>
          <Text style={styles.body}>Trip not found or you are not assigned to it.</Text>
          <Text style={styles.bodyMuted}>Only the allocated driver can view this trip.</Text>
        </>
      ) : (
        <>
          <Text style={styles.body}>Couldn't load this trip.</Text>
          <Text style={styles.bodyMuted}>Check your connection and try again.</Text>
          <Button label="Retry" flex={false} style={{ marginTop: spacing.md, paddingHorizontal: spacing.xl }} onPress={() => loadBooking()} />
        </>
      )}
    </View>
  );

  // ── Derived display values ────────────────────────────────────────────────
  const pickup      = booking.pickup?.address   || booking.pickupAddress?.address   || booking.pickupAddress   || '—';
  const drop        = booking.drop?.address     || booking.dropAddress?.address     || booking.dropAddress     || '—';
  const pickupCoord = booking.pickup?.lat != null
    ? { lat: Number(booking.pickup.lat), lng: Number(booking.pickup.lng) }
    : booking.pickupLat != null
      ? { lat: Number(booking.pickupLat), lng: Number(booking.pickupLng) }
      : null;
  const dropCoord   = booking.drop?.lat != null
    ? { lat: Number(booking.drop.lat), lng: Number(booking.drop.lng) }
    : booking.dropLat != null
      ? { lat: Number(booking.dropLat), lng: Number(booking.dropLng) }
      : null;

  // Corrected field names (Document C §6 / F-7)
  const distanceKm   = booking.distanceKm;
  const estimatedFare = booking.estimatedFare;
  const finalFare     = booking.finalFare;
  const balanceDue    = Number(booking.balanceDue) || 0;
  const knownStart    = startOdometerOf(booking) ?? startReadingLocal;

  // STEP_POSITION, not indexOf — EN_ROUTE is no longer a displayed step, and
  // indexOf would return -1 for it, wiping the whole progress bar for any
  // booking dispatch had put in that state.
  const stepIdx  = STEP_POSITION[booking.status] ?? -1;

  // OTP entry should show if driver is at REACHED and hasn't started yet
  const showOtp  = booking.status === 'REACHED';

  // The customer's phone number is only shown once the driver has REACHED the
  // pickup point. This is a client-side gate: the backend still returns the
  // number in the trip payload, but the app hides it (and the Call button) until
  // the driver marks "Arrived at Pickup". For it to be withheld on the wire too,
  // the backend would need to omit customer.phone before REACHED.
  const phoneUnlocked = ['REACHED', 'ONGOING', 'ARRIVED', 'COMPLETED'].includes(booking.status);
  const customerPhone = booking.customer?.phone || booking.customer?.user?.phone || null;
  const cashDue  = balanceDue > 0 && ['ARRIVED','COMPLETED'].includes(booking.status);

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={Platform.OS === 'ios' ? 100 : 0}>
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onPullRefresh} tintColor={colors.primary} colors={[colors.primary]} />}
    >

      {/* ── Status progress bar ── */}
      <View style={styles.progressCard}>
        <Text style={styles.progressLabel}>Trip Progress</Text>
        <View style={styles.steps}>
          {STATUS_STEPS.map((step, i) => (
            <View key={step} style={styles.stepItem}>
              <View style={[
                styles.stepDot,
                i < stepIdx  && styles.stepDone,
                i === stepIdx && styles.stepActive,
              ]}>
                {i < stepIdx && <CheckCircle2 size={10} color="#fff" />}
              </View>
              <Text
                style={[styles.stepLabel, i === stepIdx && styles.stepLabelActive]}
                numberOfLines={2}
              >
                {STATUS_LABELS[step] || step}
              </Text>
            </View>
          ))}
        </View>
      </View>

      {/* ── Route ── */}
      <Card Icon={MapPin} title="Route">
        <TripMap pickup={pickupCoord} drop={dropCoord} height={180} />
        <View style={{ height: spacing.md }} />
        <Pressable style={styles.routeRow} onPress={() => openInMaps(pickup)}>
          <MapPin size={16} color={colors.success} />
          <Text style={styles.routeText} numberOfLines={2}>{pickup}</Text>
          <Navigation size={14} color={colors.primary} />
        </Pressable>
        <View style={styles.routeDivider} />
        <Pressable style={styles.routeRow} onPress={() => openInMaps(drop)}>
          <MapPin size={16} color={colors.danger} />
          <Text style={styles.routeText} numberOfLines={2}>{drop}</Text>
          <Navigation size={14} color={colors.primary} />
        </Pressable>
        <Text style={styles.routeHint}>Tap any address for navigation</Text>
      </Card>

      {/* ── Customer ── */}
      <Card Icon={User} title="Customer">
        <View style={styles.customerRow}>
          <View style={styles.customerInfo}>
            <Text style={styles.customerName}>
              {booking.customer?.name || booking.customer?.user?.name || '—'}
            </Text>
            {phoneUnlocked ? (
              <Text style={styles.customerPhone}>{customerPhone || '—'}</Text>
            ) : (
              <Text style={styles.customerPhoneLocked}>
                Available once you reach the pickup point
              </Text>
            )}
          </View>
          {phoneUnlocked && customerPhone && (
            <Pressable style={styles.callBtn} onPress={callCustomer}>
              <Phone size={18} color={colors.primaryText} />
              <Text style={styles.callBtnText}>Call</Text>
            </Pressable>
          )}
        </View>
      </Card>

      {/* ── Fare breakdown (corrected fields) ── */}
      <Card title="Fare Breakdown">
        {finalFare != null ? (
          <View style={[styles.fareRow, styles.fareTotalRow]}>
            <Text style={styles.fareTotalLabel}>Final Fare</Text>
            <Text style={styles.fareTotalValue}>₹{fmtMoney(finalFare)}</Text>
          </View>
        ) : estimatedFare != null ? (
          <View style={[styles.fareRow, styles.fareTotalRow]}>
            <Text style={styles.fareTotalLabel}>Estimated Fare</Text>
            <Text style={styles.fareTotalValue}>₹{fmtMoney(estimatedFare)}</Text>
          </View>
        ) : null}

        {distanceKm != null && (
          <View style={styles.fareRow}>
            <Text style={styles.fareLabel}>Estimated distance</Text>
            <Text style={styles.fareValue}>{distanceKm} km</Text>
          </View>
        )}
        {balanceDue > 0 && (
          <View style={styles.fareRow}>
            <Text style={[styles.fareLabel, { color: colors.danger }]}>Balance due</Text>
            <Text style={[styles.fareValue, { color: colors.danger }]}>₹{fmtMoney(balanceDue)}</Text>
          </View>
        )}
        <View style={styles.fareRow}>
          <Text style={styles.fareLabel}>Payment mode</Text>
          <Text style={styles.fareValue}>{booking.paymentMode || '—'}</Text>
        </View>
        {distanceKm != null && (
          <View style={styles.infoBox}>
            <Info size={14} color={colors.primary} />
            <Text style={styles.infoText}>
              If actual distance exceeds {distanceKm} km, the fare is automatically
              recalculated when you submit the odometer reading.
            </Text>
          </View>
        )}
      </Card>

      {/* ══════════════════════════════════════════════════════════════════════
          LIFECYCLE ACTIONS — one section per status
          ══════════════════════════════════════════════════════════════════════ */}

      {/* ALLOCATED | EN_ROUTE → Arrived at Pickup.
          The separate "Start heading to pickup" tap is gone — the backend now
          accepts ALLOCATED -> REACHED directly (lifecycle.service.js), so the
          driver marks arrival in one action. EN_ROUTE is still handled here
          because dispatch can set it and older bookings sit in it. */}
      {['ALLOCATED', 'EN_ROUTE'].includes(booking.status) && (
        <Button
          label={actioning ? 'Marking…' : '📍 I have arrived at pickup point'}
          Icon={MapPin}
          loading={actioning}
          flex={false}
          style={styles.actionBtn}
          onPress={handleReached}
        />
      )}

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          OTP ENTRY — shown when driver is at REACHED
          The customer received a 6-digit OTP via email/push when driver called
          markReached(). Driver asks customer for the OTP and enters it here
          to verify the customer is physically present and start the trip.
          ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      {showOtp && (
        <Card Icon={Key} title="Verify Ride OTP to Start">
          {/* Instruction */}
          <View style={styles.otpInfoBox}>
            <Key size={18} color={colors.primary} />
            <Text style={styles.otpInfoText}>
              Ask the customer for the {OTP_LENGTH}-digit OTP sent to them. Enter it
              below to confirm they're in the vehicle and start the trip.
            </Text>
          </View>

          {/* 6-cell OTP input. A single transparent TextInput is overlaid on
              top of the display cells so tapping anywhere focuses it and pops
              the numeric keypad (a zero-size hidden input won't focus on
              Android). Tap the cells OR they auto-focus on open. */}
          <Pressable style={styles.otpWrap} onPress={() => otpRef.current?.focus()}>
            <View style={styles.otpRow} pointerEvents="none">
              {Array.from({ length: OTP_LENGTH }, (_, i) => (
                <View
                  key={i}
                  style={[styles.otpCell, !!otpValue[i] && styles.otpCellFilled, !!otpError && styles.otpCellError]}
                >
                  <Text style={styles.otpDigit}>{otpValue[i] || ' '}</Text>
                </View>
              ))}
            </View>

            <TextInput
              ref={otpRef}
              style={styles.otpOverlayInput}
              value={otpValue}
              onChangeText={(v) => {
                const digits = v.replace(/\D/g, '').slice(0, OTP_LENGTH);
                setOtpValue(digits);
                if (otpError) setOtpError(null);
              }}
              keyboardType="number-pad"
              maxLength={OTP_LENGTH}
              autoFocus
              caretHidden
              textContentType="oneTimeCode"
              importantForAutofill="yes"
            />
          </Pressable>

          {!!otpError && (
            <View style={styles.otpErrorBox}>
              <AlertTriangle size={14} color={colors.danger} />
              <Text style={styles.otpErrorText}>{otpError}</Text>
            </View>
          )}

          {/* Start odometer — required. The fare reconciliation on completion
              compares start vs end, so an end reading alone proves nothing. */}
          <View style={styles.startOdoBlock}>
            <Text style={styles.startOdoLabel}>Odometer reading (km) *</Text>
            <TextInput
              style={styles.startOdoInput}
              value={startOdometer}
              onChangeText={(v) => { setStartOdometer(v.replace(/[^\d]/g, '').slice(0, 7)); if (otpError) setOtpError(null); }}
              keyboardType="number-pad"
              placeholder="e.g. 45120"
              placeholderTextColor={colors.textMuted}
            />
            <Pressable style={styles.startOdoPhotoBtn} onPress={pickStartOdometerPhoto}>
              <Camera size={15} color={colors.primary} />
              <Text style={styles.startOdoPhotoText}>
                {startOdometerPhoto ? 'Odometer photo added ✓ — tap to retake' : 'Add odometer photo (recommended)'}
              </Text>
            </Pressable>
          </View>

          <Button
            label={verifyingOtp ? 'Verifying…' : 'Verify OTP & Start Ride'}
            Icon={Play}
            loading={verifyingOtp}
            flex={false}
            style={[styles.actionBtn, { marginTop: spacing.md }]}
            onPress={handleVerifyOtpAndStart}
          />

          <Text style={styles.otpHint}>
            Wrong OTP? Ask the customer to check their email or app notification.
          </Text>
        </Card>
      )}

      {/* ONGOING — trip is running: driver marks arrival at drop-off */}
      {booking.status === 'ONGOING' && (
        <>
          <View style={styles.waitingBox}>
            <Info size={16} color={colors.primary} />
            <Text style={styles.waitingText}>
              Trip in progress 🚗. Tap below once you reach the destination.
            </Text>
          </View>
          <Button
            label={markingArrived ? 'Marking…' : '🏁 I have arrived at the destination'}
            Icon={MapPin}
            loading={markingArrived}
            flex={false}
            style={styles.actionBtn}
            onPress={handleArrived}
          />
        </>
      )}

      {/* ── Collect Cash (ARRIVED or COMPLETED with balance due) ── */}
      {cashDue && (
        <Button
          label={collectingCash ? 'Collecting…' : `Collect Cash ₹${fmtMoney(balanceDue)}`}
          Icon={DollarSign}
          variant="primary"
          loading={collectingCash}
          flex={false}
          style={styles.actionBtn}
          onPress={handleCollectCash}
        />
      )}

      {/* ── ARRIVED / COMPLETED — Odometer + Complete ── */}
      {['ARRIVED', 'COMPLETED'].includes(booking.status) && (
        <Card Icon={Gauge} title="Final Odometer Reading"
          hint="Take a clear photo and enter the final odometer reading. The backend calculates extra-km charges automatically.">

          <Text style={styles.fieldLabel}>Odometer Photo</Text>
          <Pressable style={styles.photoPicker} onPress={pickOdometerPhoto}>
            {odometerPhoto ? (
              <Image source={{ uri: odometerPhoto.uri }} style={styles.photoPreview} />
            ) : (
              <View style={styles.photoPlaceholder}>
                <Camera size={28} color={colors.textMuted} />
                <Text style={styles.photoPlaceholderText}>Tap to take/choose photo</Text>
                <View style={styles.photoOptions}>
                  <View style={styles.photoOptionBadge}>
                    <Camera size={11} color={colors.primary} />
                    <Text style={styles.photoOptionText}>Camera</Text>
                  </View>
                  <View style={styles.photoOptionBadge}>
                    <ImageIcon size={11} color={colors.primary} />
                    <Text style={styles.photoOptionText}>Gallery</Text>
                  </View>
                </View>
              </View>
            )}
          </Pressable>
          {odometerPhoto && (
            <Pressable onPress={pickOdometerPhoto}>
              <Text style={styles.retakeText}>Tap photo to retake</Text>
            </Pressable>
          )}

          <Text style={[styles.fieldLabel, { marginTop: spacing.md }]}>
            Final KM{knownStart != null ? `  (start: ${knownStart} km)` : ''}
          </Text>
          <View style={[styles.odometerInputRow, !!odometerError && styles.odometerInputRowError]}>
            <Milestone size={18} color={colors.textMuted} />
            <TextInput
              style={styles.odometerInput}
              keyboardType="decimal-pad"
              value={odometerKm}
              onChangeText={(v) => { setOdometerKm(v.replace(/,/g, '.').replace(/[^\d.]/g, '')); if (odometerError) setOdometerError(null); }}
              placeholder="e.g. 45210"
              placeholderTextColor={colors.textMuted}
            />
            <Text style={styles.kmUnit}>km</Text>
          </View>
          {!!odometerError && <Text style={styles.errorLine}>{odometerError}</Text>}

          {/* Record odometer (does NOT complete the trip) */}
          <Button
            label={submittingOdo ? 'Recording…' : 'Record Odometer Reading'}
            Icon={Gauge}
            variant="secondary"
            loading={submittingOdo}
            flex={false}
            style={styles.actionBtn}
            onPress={submitOdometer}
          />

          {odoRecorded && (
            <View style={styles.confirmedRow}>
              <CheckCircle2 size={17} color={colors.success} />
              <Text style={styles.confirmedText}>Odometer reading recorded ✓</Text>
            </View>
          )}

          {/* Complete trip button — only at ARRIVED, not COMPLETED */}
          {booking.status === 'ARRIVED' && (
            <>
              <View style={styles.divider} />
              <Button
                label={completing ? 'Completing…' : 'Complete Trip ✓'}
                Icon={Flag}
                loading={completing}
                flex={false}
                style={styles.completeBtn}
                onPress={handleComplete}
              />
              {balanceDue > 0 && (
                <Text style={styles.paymentWarning}>
                  ⚠ Collect the ₹{fmtMoney(balanceDue)} cash balance before completing.
                </Text>
              )}
            </>
          )}
        </Card>
      )}

      {/* ── Rate the customer (trip finished) ── */}
      {booking.status === 'COMPLETED' && (
        <Button
          label="Rate the customer"
          Icon={Star}
          variant="secondary"
          flex={false}
          style={styles.actionBtn}
          onPress={() => navigation.navigate('RateCustomer', {
            bookingId,
            customerName: booking?.customer?.name || booking?.customer?.user?.name || 'the customer',
          })}
        />
      )}

      {/* ── SOS ── */}
      <Button
        label="Emergency — Call Support"
        variant="danger"
        Icon={AlertTriangle}
        IconRight={Phone}
        flex={false}
        style={styles.sosBtn}
        onPress={() => Linking.openURL(`tel:${SUPPORT_PHONE}`).catch(() => {})}
      />
    </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container:            { flex: 1, backgroundColor: colors.background },
  content:              { padding: spacing.lg },
  center:               { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.sm },
  body:                 { ...type.body, color: colors.textMuted, textAlign: 'center' },
  bodyMuted:            { fontSize: 12, color: colors.textMuted, textAlign: 'center' },

  // Progress
  progressCard:         { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.lg },
  progressLabel:        { ...type.label, color: colors.textMuted, marginBottom: spacing.md },
  steps:                { flexDirection: 'row', justifyContent: 'space-between' },
  stepItem:             { alignItems: 'center', flex: 1 },
  stepDot:              { width: 22, height: 22, borderRadius: 11, backgroundColor: colors.border, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  stepDone:             { backgroundColor: colors.success },
  stepActive:           { backgroundColor: colors.primary },
  stepLabel:            { fontSize: 8, color: colors.textMuted, textAlign: 'center' },
  stepLabelActive:      { color: colors.primary, fontWeight: '700' },

  // Route
  routeRow:             { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  routeText:            { flex: 1, fontSize: 14, color: colors.text },
  routeDivider:         { height: 1, backgroundColor: colors.border, marginVertical: spacing.sm, marginLeft: 22 },
  routeHint:            { fontSize: 11, color: colors.textMuted, marginTop: spacing.sm, fontStyle: 'italic' },

  // Customer
  customerRow:          { flexDirection: 'row', alignItems: 'center' },
  customerInfo:         { flex: 1 },
  customerName:         { fontSize: 15, fontWeight: '700', color: colors.text },
  customerPhone:        { fontSize: 13, color: colors.textMuted },
  customerPhoneLocked:  { fontSize: 12, color: colors.textMuted, fontStyle: 'italic' },
  callBtn:              { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, backgroundColor: colors.primary, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  callBtnText:          { color: colors.primaryText, fontWeight: '700' },

  // Fare
  fareRow:              { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.xs, borderBottomWidth: 1, borderBottomColor: colors.border },
  fareLabel:            { fontSize: 13, color: colors.textMuted },
  fareValue:            { fontSize: 13, fontWeight: '600', color: colors.text },
  fareTotalRow:         { borderTopWidth: 2, borderTopColor: colors.text, marginTop: spacing.xs, paddingTop: spacing.sm, borderBottomWidth: 0 },
  fareTotalLabel:       { fontSize: 15, fontWeight: '700', color: colors.text },
  fareTotalValue:       { fontSize: 15, fontWeight: '700', color: colors.primary },
  infoBox:              { flexDirection: 'row', gap: spacing.sm, backgroundColor: '#EEF6FF', borderRadius: radius.md, padding: spacing.sm, marginTop: spacing.md },
  infoText:             { flex: 1, fontSize: 12, color: '#1565C0', lineHeight: 17 },

  // OTP
  otpInfoBox:           { flexDirection: 'row', gap: spacing.sm, backgroundColor: '#FFFDE7', borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.lg, borderWidth: 1, borderColor: '#FDD835' },
  otpInfoText:          { flex: 1, fontSize: 13, color: '#5D4037', lineHeight: 19 },
  otpRow:               { flexDirection: 'row', gap: spacing.sm, justifyContent: 'center', marginBottom: spacing.sm },
  otpCell:              { width: 44, height: 56, borderRadius: radius.md, borderWidth: 2, borderColor: colors.border, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  otpCellFilled:        { borderColor: colors.primary, backgroundColor: '#FFFDE7' },
  otpCellError:         { borderColor: colors.danger },
  otpDigit:             { fontSize: 24, fontWeight: '800', color: colors.text, letterSpacing: 2 },
  otpWrap:              { position: 'relative', marginBottom: spacing.sm },
  otpOverlayInput:      { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: 0, color: 'transparent' },
  otpErrorBox:          { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, backgroundColor: '#FFEBEE', borderRadius: radius.md, padding: spacing.sm, marginBottom: spacing.sm },
  otpErrorText:         { flex: 1, fontSize: 12, color: colors.danger, fontWeight: '600' },
  startOdoBlock:        { marginTop: spacing.md, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md },
  startOdoLabel:        { fontSize: 13, fontWeight: '700', color: colors.text, marginBottom: spacing.sm },
  startOdoInput:        { borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 10, fontSize: 18, fontWeight: '700', color: colors.text, backgroundColor: colors.background, letterSpacing: 1 },
  startOdoPhotoBtn:     { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm, paddingVertical: spacing.sm },
  startOdoPhotoText:    { fontSize: 12.5, fontWeight: '600', color: colors.primary },
  otpHint:              { fontSize: 11, color: colors.textMuted, textAlign: 'center', marginTop: spacing.sm, fontStyle: 'italic' },

  // Odometer
  fieldLabel:           { ...type.label, color: colors.text, marginBottom: spacing.xs },
  photoPicker:          { borderWidth: 2, borderColor: colors.border, borderRadius: radius.lg, borderStyle: 'dashed', marginBottom: spacing.sm, overflow: 'hidden' },
  photoPreview:         { width: '100%', height: 160, resizeMode: 'cover' },
  photoPlaceholder:     { height: 140, alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  photoPlaceholderText: { fontSize: 13, color: colors.textMuted },
  photoOptions:         { flexDirection: 'row', gap: spacing.sm },
  photoOptionBadge:     { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.surfaceAlt, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 3, borderWidth: 1, borderColor: colors.border },
  photoOptionText:      { fontSize: 11, color: colors.primary, fontWeight: '600' },
  retakeText:           { fontSize: 12, color: colors.primary, textAlign: 'center', marginBottom: spacing.md },
  odometerInputRow:     { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, backgroundColor: colors.surface, marginBottom: spacing.md },
  odometerInputRowError:{ borderColor: colors.danger, marginBottom: spacing.xs },
  odometerInput:        { flex: 1, fontSize: 20, fontWeight: '700', color: colors.text, paddingVertical: spacing.md },
  kmUnit:               { fontSize: 15, color: colors.textMuted, fontWeight: '600' },
  errorLine:            { fontSize: 12, color: colors.danger, marginBottom: spacing.md, fontWeight: '600' },

  // Waiting / info
  waitingBox:           { flexDirection: 'row', gap: spacing.sm, backgroundColor: '#EEF6FF', borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.lg },
  waitingText:          { flex: 1, fontSize: 13, color: '#1565C0', lineHeight: 18 },

  // Actions
  actionBtn:            { alignSelf: 'stretch', marginBottom: spacing.lg },
  confirmedRow:         { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, justifyContent: 'center', marginTop: spacing.sm },
  confirmedText:        { color: colors.success, fontWeight: '700', fontSize: 13 },
  divider:              { height: 1, backgroundColor: colors.border, marginVertical: spacing.lg },
  completeBtn:          { alignSelf: 'stretch' },
  paymentWarning:       { fontSize: 12, color: colors.danger, textAlign: 'center', marginTop: spacing.sm, fontWeight: '600' },
  sosBtn:               { alignSelf: 'stretch', marginBottom: spacing.lg },
});