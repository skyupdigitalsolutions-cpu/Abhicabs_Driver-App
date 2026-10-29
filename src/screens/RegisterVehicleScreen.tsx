// @ts-nocheck
/**
 * src/screens/RegisterVehicleScreen.jsx
 *
 * CHANGE: fuelType removed from the submit payload.
 * The backend's registerVehicleSchema does not include fuelType — sending it
 * caused silent stripping (Document A #19, Document C §4).
 * The fuelType UI chip is removed so drivers aren't confused by a field
 * that has no effect until the backend adds the column.
 *
 * VEHICLE TYPES: the class list and per-class seat counts are loaded live from
 * the backend catalogue (GET /vehicles) so a driver can register EVERY class the
 * platform offers — not a hard-coded subset. Selecting a class pre-fills its
 * seat count (still editable). FALLBACK_CLASSES is used only if the catalogue
 * cannot be reached; the failure is shown with a Retry, never hidden.
 */
import { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View, Pressable } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import {
  Car, Hash, Wrench, Calendar, Palette, Users,
  CheckCircle, ChevronRight, AlertTriangle,
} from 'lucide-react-native';
import { colors, spacing } from '../theme';
import { InputField }           from '../components/InputField';
import { DateField }            from '../components/DateField';
import { Button }               from '../components/Button';
import { ChipGroup }            from '../components/ChipGroup';
import { Card }                 from '../components/Card';
import { driverApplicationApi, vehicleCatalogApi } from '../api/endpoints';
import { useSession, skipVehicleRegistration } from '../store/session';

// Only used if the live catalogue can't be fetched (offline at the exact moment
// of registration). Kept minimal and clearly a fallback, not the source of truth.
const FALLBACK_CLASSES = [
  { value: 'hatchback', label: 'Hatchback',       seats: 4  },
  { value: 'sedan',     label: 'Sedan',           seats: 4  },
  { value: 'suv',       label: 'SUV',             seats: 7  },
  { value: 'tempo',     label: 'Tempo Traveller', seats: 12 },
];

export function RegisterVehicleScreen() {
  const { refresh, onboarding, driverStatus } = useSession();
  // Same screen serves onboarding (Root router) and Profile → Add vehicle
  // (MainTabs stack). Only onboarding offers "skip", and only the main app
  // needs to navigate on to the documents step itself.
  const inOnboarding = driverStatus !== 'approved';
  const featureOff = onboarding?.vehicleFeatureAvailable === false;
  const navigation = useNavigation();

  const [vehicleClass,       setVehicleClass]       = useState('');
  const [registrationNumber, setRegistrationNumber] = useState('');
  const [makeModel,          setMakeModel]          = useState('');
  const [year,               setYear]               = useState('');
  const [colour,             setColour]             = useState('');
  const [seatingCapacity,    setSeatingCapacity]    = useState('');
  const [seatsEdited,        setSeatsEdited]        = useState(false);
  // Compliance / validity dates — the backend stores these on the vehicle
  // (insurance_expiry, puc_expiry, fitness_expiry, permit_expiry) and
  // registerVehicleSchema accepts them; all optional (YYYY-MM-DD).
  const [insuranceExpiry,    setInsuranceExpiry]    = useState('');
  const [pucExpiry,          setPucExpiry]          = useState('');
  const [fitnessExpiry,      setFitnessExpiry]      = useState('');
  const [permitExpiry,       setPermitExpiry]       = useState('');
  const [submitting,         setSubmitting]         = useState(false);
  const [skipping,           setSkipping]           = useState(false);

  // Vehicle classes + seats from the backend catalogue (GET /vehicles).
  const [classes,        setClasses]        = useState([]);
  const [classesLoading, setClassesLoading] = useState(true);
  const [classesError,   setClassesError]   = useState(false);

  async function loadClasses() {
    setClassesLoading(true);
    setClassesError(false);
    try {
      const rows = await vehicleCatalogApi.list();
      const mapped = (rows || [])
        .filter((v) => v && v.key)
        .map((v) => ({ value: v.key, label: v.name || v.key, seats: Number(v.seats) || undefined }));
      if (mapped.length === 0) throw new Error('empty catalogue');
      setClasses(mapped);
    } catch (_e) {
      // Visible fallback — not a silent swap. The Retry row below surfaces it.
      setClasses(FALLBACK_CLASSES);
      setClassesError(true);
    } finally {
      setClassesLoading(false);
    }
  }

  useEffect(() => { loadClasses(); }, []);

  // Default the selected class to the first one once the list is known, and keep
  // seating capacity in step with the chosen class until the driver edits it.
  useEffect(() => {
    if (!classes.length) return;
    const current = classes.find((c) => c.value === vehicleClass);
    if (!current) {
      const first = classes[0];
      setVehicleClass(first.value);
      if (!seatsEdited && first.seats) setSeatingCapacity(String(first.seats));
    } else if (!seatsEdited && current.seats) {
      setSeatingCapacity(String(current.seats));
    }
  }, [classes, vehicleClass, seatsEdited]);

  function onPickClass(value) {
    setVehicleClass(value);
    const picked = classes.find((c) => c.value === value);
    if (!seatsEdited && picked?.seats) setSeatingCapacity(String(picked.seats));
  }

  const normalisedReg = registrationNumber.toUpperCase().replace(/[^A-Z0-9]/g, '');

  function validate() {
    if (!vehicleClass)                           return 'Select a vehicle type';
    if (!normalisedReg)                          return 'Enter vehicle registration number';
    if (normalisedReg.length < 6 || normalisedReg.length > 11)
      return 'Enter a valid registration number (e.g. KA01AB1234)';
    if (!makeModel.trim())                       return 'Enter vehicle make & model';
    if (year && (!/^\d{4}$/.test(year) || Number(year) < 1990 || Number(year) > new Date().getFullYear() + 1))
      return 'Enter a valid year';
    const seats = Number(seatingCapacity);
    if (!Number.isInteger(seats) || seats < 1 || seats > 30)
      return 'Enter valid seating capacity';
    if (badDate(insuranceExpiry)) return 'Insurance expiry must be a valid date (YYYY-MM-DD)';
    if (badDate(pucExpiry))       return 'PUC expiry must be a valid date (YYYY-MM-DD)';
    if (badDate(fitnessExpiry))   return 'Fitness expiry must be a valid date (YYYY-MM-DD)';
    if (badDate(permitExpiry))    return 'Permit expiry must be a valid date (YYYY-MM-DD)';
    return null;
  }

  // Optional date field: blank is fine; otherwise must be a real YYYY-MM-DD.
  function badDate(v) {
    if (!v.trim()) return false;
    const ok = /^\d{4}-\d{2}-\d{2}$/.test(v.trim());
    const d = ok && new Date(`${v.trim()}T00:00:00`);
    return !ok || !d || Number.isNaN(d.getTime());
  }

  // Already-past dates are allowed by the backend but worth flagging to the
  // driver inline (expired papers block going online in practice).
  function isPast(v) {
    if (badDate(v) || !v.trim()) return false;
    return new Date(`${v.trim()}T00:00:00`).getTime() < Date.now();
  }

  async function submit() {
    if (submitting) return;
    if (featureOff) {
      Alert.alert('Unavailable', 'Vehicle registration is temporarily unavailable. Please try again later.');
      return;
    }
    const err = validate();
    if (err) { Alert.alert('Missing information', err); return; }
    setSubmitting(true);
    try {
      // POST /driver/me/vehicles — fuelType intentionally omitted (not in schema)
      const res = await driverApplicationApi.registerVehicle({
        vehicleClass,
        registrationNumber: normalisedReg,
        makeModel:          makeModel.trim(),
        seatingCapacity:    Number(seatingCapacity),
        ...(year   ? { year: Number(year) }       : {}),
        ...(colour.trim() ? { colour: colour.trim() } : {}),
        ...(insuranceExpiry.trim() ? { insuranceExpiry: insuranceExpiry.trim() } : {}),
        ...(pucExpiry.trim()       ? { pucExpiry:       pucExpiry.trim() }       : {}),
        ...(fitnessExpiry.trim()   ? { fitnessExpiry:   fitnessExpiry.trim() }   : {}),
        ...(permitExpiry.trim()    ? { permitExpiry:    permitExpiry.trim() }    : {}),
      });
      await refresh();
      // Advance EXPLICITLY. Relying on Root to remount off the new session state
      // was not firing on every device, which left this button looking dead. The
      // next step after saving a vehicle is always that vehicle's documents.
      const vehicleId = res?.vehicle?.vehicle?.id ?? res?.vehicle?.id ?? res?.vehicleId ?? res?.id ?? null;
      const docsParams = { vehicleId, registrationNumber: normalisedReg };
      if (inOnboarding) {
        // Reset so RegisterVehicle is left behind in the onboarding stack.
        navigation.reset({ index: 0, routes: [{ name: 'VehicleDocuments', params: docsParams }] });
      } else {
        // From Profile (post-approval): push onto the stack so Back still works.
        navigation.replace('VehicleDocuments', docsParams);
      }
    } catch (err) {
      Alert.alert("Couldn't save vehicle", err.message || 'Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  async function skip() {
    Alert.alert(
      "Add a vehicle later?",
      "You can register a vehicle any time from your Profile once you're approved. You won't be able to go online or receive trips until you do.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Skip for now',
          onPress: async () => {
            setSkipping(true);
            try {
              // Flip the session flag first (so a later refresh won't bounce the
              // driver back to Register Vehicle)...
              await skipVehicleRegistration();
              // ...then advance EXPLICITLY instead of waiting for Root to remount
              // off the new state — that remount was not firing reliably on device
              // and left this button looking dead. With no vehicle, the next step
              // is the driver's own documents (or Application Pending if done).
              const ob = onboarding || {};
              const drvDocsMissing =
                !Array.isArray(ob.missingDriverDocs) || ob.missingDriverDocs.length > 0;
              navigation.reset({
                index: 0,
                routes: [{ name: drvDocsMissing ? 'DocumentUpload' : 'ApplicationPending' }],
              });
            } catch (err) {
              // Should be unreachable (skipVehicleRegistration swallows
              // storage errors), but never fail silently again — a dead
              // button with no feedback is what made this hard to spot.
              Alert.alert('Could not skip', err?.message || 'Please try again.');
            } finally {
              setSkipping(false);
            }
          },
        },
      ]
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

      {/* Step indicator (onboarding only) */}
      {inOnboarding && (<>
      <View style={styles.stepRow}>
        <View style={[styles.stepDot, styles.stepDone]}>
          <Text style={styles.stepNum}>✓</Text>
        </View>
        <View style={[styles.stepLine, styles.stepLineDone]} />
        <View style={[styles.stepDot, styles.stepActive]}>
          <Text style={styles.stepNum}>2</Text>
        </View>
        <View style={styles.stepLine} />
        <View style={styles.stepDot}>
          <Text style={[styles.stepNum, { color: colors.textMuted }]}>3</Text>
        </View>
        <View style={styles.stepLine} />
        <View style={styles.stepDot}>
          <Text style={[styles.stepNum, { color: colors.textMuted }]}>4</Text>
        </View>
      </View>

      <View style={styles.stepLabels}>
        <Text style={styles.stepLabel}>Personal ✓</Text>
        <Text style={[styles.stepLabel, styles.stepLabelActive]}>Vehicle</Text>
        <Text style={styles.stepLabel}>Veh. Docs</Text>
        <Text style={styles.stepLabel}>Driver Docs</Text>
      </View>
      </>)}

      <Text style={styles.title}>Register Your Vehicle</Text>
      <Text style={styles.hint}>
        Add your vehicle details. RC, insurance, and driver documents are uploaded in the next steps.
      </Text>

      {featureOff && (
        <View style={styles.unavailableBanner}>
          <AlertTriangle size={16} color="#92400E" />
          <Text style={styles.unavailableText}>
            Vehicle registration is temporarily unavailable.
          </Text>
        </View>
      )}

      <Text style={styles.fieldLabel}>Vehicle Type *</Text>
      {classesLoading ? (
        <Text style={styles.loadingText}>Loading vehicle types…</Text>
      ) : (
        <ChipGroup options={classes} value={vehicleClass} onChange={onPickClass} Icon={Car} />
      )}
      {classesError && !classesLoading && (
        <Pressable onPress={loadClasses} style={styles.retryRow}>
          <AlertTriangle size={14} color="#92400E" />
          <Text style={styles.retryText}>
            Couldn't load the full vehicle list — showing common types. Tap to retry.
          </Text>
        </Pressable>
      )}

      <InputField
        label="Registration Number *"
        value={registrationNumber}
        onChangeText={(v) => setRegistrationNumber(v.toUpperCase())}
        Icon={Hash}
        autoCapitalize="characters"
        placeholder="e.g. KA01AB1234"
      />

      <InputField
        label="Make & Model *"
        value={makeModel}
        onChangeText={setMakeModel}
        Icon={Wrench}
        placeholder="e.g. Maruti Swift Dzire"
      />

      <View style={styles.row}>
        <InputField
          label="Year"
          value={year}
          onChangeText={(v) => setYear(v.replace(/\D/g, '').slice(0, 4))}
          Icon={Calendar}
          keyboardType="number-pad"
          placeholder="2021"
          maxLength={4}
          style={styles.half}
        />
        <InputField
          label="Colour"
          value={colour}
          onChangeText={setColour}
          Icon={Palette}
          placeholder="White"
          style={styles.half}
        />
      </View>

      <InputField
        label="Seating Capacity *"
        value={seatingCapacity}
        onChangeText={(v) => { setSeatsEdited(true); setSeatingCapacity(v.replace(/\D/g, '').slice(0, 2)); }}
        Icon={Users}
        keyboardType="number-pad"
        maxLength={2}
        placeholder="4"
      />

      <Text style={styles.sectionLabel}>Document validity (optional · YYYY-MM-DD)</Text>
      <View style={styles.row}>
        <DateField
          label="Insurance expiry"
          value={insuranceExpiry}
          onChange={setInsuranceExpiry}
          Icon={Calendar}
          placeholder="Select date"
          style={styles.half}
        />
        <DateField
          label="PUC expiry"
          value={pucExpiry}
          onChange={setPucExpiry}
          Icon={Calendar}
          placeholder="Select date"
          style={styles.half}
        />
      </View>
      <View style={styles.row}>
        <DateField
          label="Fitness expiry"
          value={fitnessExpiry}
          onChange={setFitnessExpiry}
          Icon={Calendar}
          placeholder="Select date"
          style={styles.half}
        />
        <DateField
          label="Permit expiry"
          value={permitExpiry}
          onChange={setPermitExpiry}
          Icon={Calendar}
          placeholder="Select date"
          style={styles.half}
        />
      </View>
      {(isPast(insuranceExpiry) || isPast(pucExpiry) || isPast(fitnessExpiry) || isPast(permitExpiry)) && (
        <Text style={styles.expiredNote}>
          One or more dates are already in the past — you won&apos;t be able to go online until they&apos;re renewed.
        </Text>
      )}

      <Card style={styles.summaryCard}>
        <View style={styles.summaryHeader}>
          <Car size={14} color={colors.primary} />
          <Text style={styles.summaryTitle}>Vehicle summary</Text>
        </View>
        <Text style={styles.summaryRow}>
          {classes.find((v) => v.value === vehicleClass)?.label || vehicleClass || '—'}
          {' · '}
          {normalisedReg || '—'}
        </Text>
        <Text style={styles.summaryRow}>
          {makeModel || '—'} · {seatingCapacity || '—'} seats
        </Text>
      </Card>

      <Button
        label={submitting ? 'Saving vehicle...' : 'Save Vehicle & Continue'}
        onPress={submit}
        loading={submitting}
        disabled={featureOff}
        Icon={CheckCircle}
        IconRight={ChevronRight}
        flex={false}
        style={styles.fullBtn}
      />

      {inOnboarding && (
        <Pressable style={styles.skipRow} onPress={skip} disabled={skipping}>
          <Text style={styles.skipText}>
            {skipping ? 'Please wait…' : "I'll add my vehicle later"}
          </Text>
        </Pressable>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container:       { flex: 1, backgroundColor: colors.background },
  content:         { padding: spacing.lg, paddingBottom: spacing.xl * 2 },
  stepRow:         { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.xs },
  stepDot:         { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  stepActive:      { backgroundColor: colors.primary, borderColor: colors.primary },
  stepDone:        { backgroundColor: colors.success, borderColor: colors.success },
  stepNum:         { fontSize: 11, fontWeight: '700', color: '#fff' },
  stepLine:        { flex: 1, height: 2, backgroundColor: colors.border, marginHorizontal: 4 },
  stepLineDone:    { backgroundColor: colors.success },
  stepLabels:      { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.xl },
  stepLabel:       { fontSize: 10, color: colors.textMuted, fontWeight: '600', flex: 1, textAlign: 'center' },
  stepLabelActive: { color: colors.primary },
  title:           { fontSize: 22, fontWeight: '800', color: colors.text, marginBottom: spacing.xs },
  hint:            { fontSize: 13, color: colors.textMuted, marginBottom: spacing.lg, lineHeight: 20 },
  unavailableBanner: { flexDirection: 'row', gap: spacing.sm, backgroundColor: '#FFFBEB', borderRadius: 10, borderWidth: 1, borderColor: '#FDE68A', padding: spacing.md, marginBottom: spacing.lg },
  unavailableText:   { flex: 1, fontSize: 12, color: '#92400E', lineHeight: 17 },
  fieldLabel:      { fontSize: 13, fontWeight: '700', color: colors.text, marginBottom: spacing.xs },
  loadingText:     { fontSize: 13, color: colors.textMuted, marginBottom: spacing.md },
  retryRow:        { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: -spacing.xs, marginBottom: spacing.md },
  retryText:       { flex: 1, fontSize: 11.5, color: '#92400E', lineHeight: 16 },
  row:             { flexDirection: 'row', gap: spacing.md },
  half:            { flex: 1 },
  sectionLabel:    { fontSize: 12, fontWeight: '700', color: colors.textMuted, marginTop: spacing.sm, marginBottom: spacing.sm, textTransform: 'uppercase', letterSpacing: 0.5 },
  expiredNote:     { fontSize: 12, color: colors.danger, marginTop: -spacing.xs, marginBottom: spacing.md, lineHeight: 16 },
  summaryCard:     { marginBottom: spacing.lg },
  summaryHeader:   { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: spacing.xs },
  summaryTitle:    { fontSize: 13, fontWeight: '700', color: colors.textMuted },
  summaryRow:      { fontSize: 14, color: colors.text, marginBottom: 2 },
  fullBtn:         { alignSelf: 'stretch', marginTop: spacing.sm },
  skipRow:         { alignItems: 'center', marginTop: spacing.lg, marginBottom: spacing.md },
  skipText:        { fontSize: 13, color: colors.textMuted, fontWeight: '600', textDecorationLine: 'underline' },
});
