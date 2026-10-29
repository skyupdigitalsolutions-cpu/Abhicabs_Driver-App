// @ts-nocheck
/**
 * src/screens/RegisterScreen.jsx
 *
 * Step 1 of new-driver registration — personal details.
 *
 * Login is MOBILE-NUMBER + OTP, so the mobile number is the identity that
 * matters. Email is OPTIONAL (the backend generates a placeholder when it's
 * absent) and is only used for receipts/updates. When the driver arrives here
 * from the Login screen's "No account found → Apply now" prompt, the number
 * they typed is passed in and pre-filled.
 *
 * On success POST /auth/driver/register creates the User + Driver (kycStatus
 * PENDING) and returns tokens; initSession() then auto-logs them in and the
 * root navigator moves into onboarding.
 *
 * NOTE: the number is NOT phone-OTP-verified at signup — the backend has no
 * pre-account OTP endpoint. Ownership is effectively proven on first OTP login.
 * A verify-before-create step would need a backend "registration OTP" route.
 */
import { useState } from 'react';
import {
  Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView,
  StyleSheet, Text, View,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import {
  User, Mail, Phone, CreditCard, Calendar, Check, ChevronRight,
  ArrowLeft, CheckCircle, ShieldCheck,
} from 'lucide-react-native';
import { colors, radius, spacing } from '../theme';
import { InputField }           from '../components/InputField';
import { Logo }                 from '../components/Logo';
import { Button }               from '../components/Button';
import { driverApplicationApi } from '../api/endpoints';
import { initSession }          from '../store/session';

const OFFLINE_CODES = ['SERVER_UNAVAILABLE', 'NETWORK_ERROR', 'TIMEOUT', 'BAD_RESPONSE'];

export function RegisterScreen() {
  const navigation = useNavigation();
  const route = useRoute();

  const [name,          setName]          = useState('');
  const [phone,         setPhone]         = useState((route.params?.phone || '').replace(/\D/g, '').slice(0, 10));
  const [email,         setEmail]         = useState('');
  const [licenceNumber, setLicenceNumber] = useState('');
  const [licenceExpiry, setLicenceExpiry] = useState('');
  const [consent,       setConsent]       = useState(false);
  const [errors,        setErrors]        = useState({});
  const [submitting,    setSubmitting]    = useState(false);

  // Clear a field's error as soon as the driver edits it — never leave a stale
  // red message under a field they've already fixed.
  function clearError(field) {
    setErrors((e) => (e[field] ? { ...e, [field]: null } : e));
  }

  function validate() {
    const e = {};
    if (name.trim().length < 2) e.name = 'Enter your full name';
    if (!/^[6-9]\d{9}$/.test(phone.trim())) e.phone = 'Enter a valid 10-digit mobile number';
    // Email is optional — only validate the format if something was typed.
    if (email.trim() && !/^\S+@\S+\.\S+$/.test(email.trim())) e.email = 'Enter a valid email address, or leave it blank';
    if (licenceNumber.trim().replace(/\s/g, '').length < 6) e.licence = 'Enter your driving licence number';
    // Expiry is optional — validate only if provided.
    if (licenceExpiry.trim()) {
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(licenceExpiry.trim());
      const d = m && new Date(`${licenceExpiry.trim()}T00:00:00`);
      if (!m || !d || Number.isNaN(d.getTime())) e.expiry = 'Use the format YYYY-MM-DD, or leave it blank';
      else if (d.getTime() < Date.now()) e.expiry = 'Licence has expired — enter a valid expiry date';
    }
    if (!consent) e.consent = 'Please accept the terms to continue';
    return e;
  }

  async function submit() {
    if (submitting) return;
    const e = validate();
    if (Object.keys(e).length) { setErrors(e); return; }
    setErrors({});

    const payload = {
      name:          name.trim(),
      phone:         phone.trim(),
      email:         email.trim(),            // dropped by the API layer when blank
      licenceNumber: licenceNumber.trim().toUpperCase().replace(/\s/g, ''),
    };
    if (licenceExpiry.trim()) payload.licenceExpiry = licenceExpiry.trim();

    setSubmitting(true);
    try {
      await driverApplicationApi.register(payload);
      // initSession re-fetches /auth/me + /driver/me → root navigator moves
      // into onboarding (Register Vehicle → Documents → Submit).
      await initSession();
    } catch (err) {
      // Already-registered number: don't push a retry (which would just 409
      // again) — send them to sign in.
      if (err?.code === 'DRIVER_EXISTS') {
        Alert.alert(
          'Account already exists',
          'A driver account is already registered for this number. Please sign in with your mobile number.',
          [{ text: 'Go to Login', onPress: () => navigation.navigate('Login') }],
        );
        return;
      }
      if (err?.code === 'PHONE_TAKEN') {
        setErrors((cur) => ({ ...cur, phone: err.message || 'This number is already in use. Use a different one.' }));
        return;
      }
      // Created-but-not-signed-in: the account is usable, just log in.
      if (err?.code === 'NO_TOKEN' || err?.status === 409) {
        Alert.alert(
          'Account ready',
          'Your account was created. Please sign in with your mobile number to continue.',
          [{ text: 'Go to Login', onPress: () => navigation.navigate('Login') }],
        );
        return;
      }
      const offline = OFFLINE_CODES.includes(err?.code);
      Alert.alert(
        offline ? 'Server unavailable' : "Couldn't create account",
        offline
          ? "We couldn't reach the server. Your details have not been submitted — please try again in a moment."
          : (err?.message || 'Please check your details and try again.'),
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

      <View style={styles.logoWrap}><Logo variant="color" width={170} /></View>

      {/* Step indicator */}
      <View style={styles.stepRow}>
        <View style={[styles.stepDot, styles.stepActive]}><Text style={styles.stepNum}>1</Text></View>
        <View style={styles.stepLine} />
        <View style={styles.stepDot}><Text style={[styles.stepNum, { color: colors.textMuted }]}>2</Text></View>
        <View style={styles.stepLine} />
        <View style={styles.stepDot}><Text style={[styles.stepNum, { color: colors.textMuted }]}>3</Text></View>
      </View>
      <View style={styles.stepLabels}>
        <Text style={[styles.stepLabel, styles.stepLabelActive]}>Personal</Text>
        <Text style={styles.stepLabel}>Vehicle</Text>
        <Text style={styles.stepLabel}>Documents</Text>
      </View>

      <Text style={styles.title}>Create driver account</Text>
      <Text style={styles.hint}>
        Just your basics to start. You'll add your vehicle and documents on the next steps, then we'll verify your account.
      </Text>

      <InputField
        label="Full name *"
        value={name}
        onChangeText={(v) => { setName(v); clearError('name'); }}
        Icon={User}
        placeholder="As printed on your licence"
        autoCapitalize="words"
        returnKeyType="next"
      />
      {errors.name ? <Text style={styles.err}>{errors.name}</Text> : null}

      <InputField
        label="Mobile number *"
        value={phone}
        onChangeText={(v) => { setPhone(v.replace(/\D/g, '').slice(0, 10)); clearError('phone'); }}
        Icon={Phone}
        keyboardType="phone-pad"
        maxLength={10}
        placeholder="10-digit number"
        returnKeyType="next"
      />
      <Text style={styles.helper}>You'll sign in with this number and an OTP, so use one you have with you.</Text>
      {errors.phone ? <Text style={styles.err}>{errors.phone}</Text> : null}

      <InputField
        label="Email (optional)"
        value={email}
        onChangeText={(v) => { setEmail(v); clearError('email'); }}
        Icon={Mail}
        keyboardType="email-address"
        autoCapitalize="none"
        placeholder="you@example.com"
        returnKeyType="next"
      />
      <Text style={styles.helper}>For ride receipts and updates. You can add it later.</Text>
      {errors.email ? <Text style={styles.err}>{errors.email}</Text> : null}

      <InputField
        label="Driving licence number *"
        value={licenceNumber}
        onChangeText={(v) => { setLicenceNumber(v.toUpperCase()); clearError('licence'); }}
        Icon={CreditCard}
        autoCapitalize="characters"
        placeholder="e.g. KA0120210012345"
        returnKeyType="next"
      />
      {errors.licence ? <Text style={styles.err}>{errors.licence}</Text> : null}

      <InputField
        label="Licence expiry (optional)"
        value={licenceExpiry}
        onChangeText={(v) => { setLicenceExpiry(v.replace(/[^\d-]/g, '').slice(0, 10)); clearError('expiry'); }}
        Icon={Calendar}
        keyboardType="numbers-and-punctuation"
        placeholder="YYYY-MM-DD"
        maxLength={10}
        returnKeyType="done"
      />
      {errors.expiry ? <Text style={styles.err}>{errors.expiry}</Text> : null}

      {/* Consent */}
      <Pressable
        style={styles.consentRow}
        onPress={() => { setConsent((c) => !c); clearError('consent'); }}
        hitSlop={8}
      >
        <View style={[styles.checkbox, consent && styles.checkboxOn]}>
          {consent ? <Check size={14} color={colors.primaryText} /> : null}
        </View>
        <Text style={styles.consentText}>
          I confirm these details are correct and I agree to the Terms & Conditions and Privacy Policy.
        </Text>
      </Pressable>
      {errors.consent ? <Text style={styles.err}>{errors.consent}</Text> : null}

      <Button
        label={submitting ? 'Creating account…' : 'Continue'}
        onPress={submit}
        loading={submitting}
        Icon={CheckCircle}
        IconRight={ChevronRight}
        flex={false}
        style={styles.fullBtn}
      />

      <View style={styles.assureRow}>
        <ShieldCheck size={13} color={colors.textMuted} />
        <Text style={styles.assureText}>Your details are used only for driver verification.</Text>
      </View>

      <Pressable style={styles.linkBtn} onPress={() => navigation.navigate('Login')}>
        <ArrowLeft size={15} color={colors.primary} />
        <Text style={styles.linkText}>Already registered? Log in</Text>
      </Pressable>
    </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container:       { flex: 1, backgroundColor: colors.background },
  content:         { padding: spacing.lg, paddingBottom: spacing.xl * 2 },

  logoWrap:        { alignItems: 'center', marginBottom: spacing.lg },
  stepRow:         { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.xs },
  stepDot:         { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  stepActive:      { backgroundColor: colors.primary, borderColor: colors.primary },
  stepNum:         { fontSize: 12, fontWeight: '700', color: colors.primaryText },
  stepLine:        { flex: 1, height: 2, backgroundColor: colors.border, marginHorizontal: 4 },
  stepLabels:      { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.xl },
  stepLabel:       { fontSize: 11, color: colors.textMuted, fontWeight: '600', flex: 1, textAlign: 'center' },
  stepLabelActive: { color: colors.primary },

  title:           { fontSize: 22, fontWeight: '800', color: colors.text, marginBottom: spacing.xs },
  hint:            { fontSize: 13, color: colors.textMuted, marginBottom: spacing.lg, lineHeight: 20 },

  helper:          { fontSize: 11.5, color: colors.textMuted, marginTop: -spacing.xs, marginBottom: spacing.sm, lineHeight: 16 },
  err:             { fontSize: 12, color: colors.danger, marginTop: -spacing.xs, marginBottom: spacing.sm },

  consentRow:      { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, marginTop: spacing.sm, marginBottom: spacing.xs },
  checkbox:        { width: 22, height: 22, borderRadius: radius.sm, borderWidth: 1.5, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  checkboxOn:      { backgroundColor: colors.primary, borderColor: colors.primary },
  consentText:     { flex: 1, fontSize: 12.5, color: colors.textMuted, lineHeight: 18 },

  fullBtn:         { alignSelf: 'stretch', marginTop: spacing.md },
  assureRow:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, marginTop: spacing.md },
  assureText:      { fontSize: 11.5, color: colors.textMuted },
  linkBtn:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, marginTop: spacing.lg },
  linkText:        { color: colors.primary, fontWeight: '700', fontSize: 14 },
});
