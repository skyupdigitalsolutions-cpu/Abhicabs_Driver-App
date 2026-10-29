// @ts-nocheck
import { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { LogIn, Smartphone, KeyRound, UserPlus, ArrowLeft } from 'lucide-react-native';
import { colors, radius, spacing, type } from '../theme';
import { BUILD_TAG } from '../buildInfo';
import { InputField } from '../components/InputField';
import { Logo } from '../components/Logo';
import { Button }     from '../components/Button';
import { authApi }    from '../api/endpoints';
import { initSession } from '../store/session';

/**
 * Mobile-number + OTP login. The OTP is delivered by SMS — so this screen
 * collects the driver's 10-digit mobile number, and authApi sends { phone } /
 * { phone, code } with the number normalised to E.164 (+91…). Email-OTP login
 * has been removed.
 *
 * The backend accepts `phone` on /auth/otp/request and /auth/otp/verify and
 * sends the code by SMS (verified against authOtp.service.js), so this works
 * end-to-end — no backend change needed.
 */
export function LoginScreen() {
  const navigation = useNavigation();
  const [step,    setStep]    = useState('phone'); // 'phone' | 'code'
  const [phone,   setPhone]   = useState('');
  const [code,    setCode]    = useState('');
  const [loading, setLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0); // seconds until "Resend" is allowed

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  // Accept a bare 10-digit Indian mobile (optionally with +91 / 0 prefix the
  // user may type); we strip to the last 10 digits and validate the leading 6-9.
  const digitsOnly = phone.replace(/\D/g, '');
  const localTen   = digitsOnly.length > 10 ? digitsOnly.slice(-10) : digitsOnly;
  const phoneValid = /^[6-9]\d{9}$/.test(localTen);

  async function sendCode() {
    if (loading || cooldown > 0) return;
    if (!phoneValid) {
      Alert.alert('Invalid mobile number', 'Enter the 10-digit mobile number on your driver account.');
      return;
    }
    setLoading(true);
    try {
      await authApi.requestOtp(localTen);
      setStep('code');
      setCode('');
      setCooldown(30); // stops repeated taps from spamming SMS / hitting rate limits
    } catch (err) {
      if (err.code === 'NOT_REGISTERED') {
        Alert.alert(
          'No account found',
          'There is no driver account for this mobile number yet. Would you like to apply?',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Apply Now', onPress: () => navigation.navigate('Register', { phone: localTen }) },
          ],
        );
      } else {
        Alert.alert("Couldn't send code", err.message || 'Please try again.');
      }
    } finally {
      setLoading(false);
    }
  }

  async function verifyCode() {
    if (loading) return;
    if (!code.trim()) {
      Alert.alert('Enter the code', 'Enter the code sent to your mobile number.');
      return;
    }
    setLoading(true);
    try {
      await authApi.verifyOtp(localTen, code.trim());
      await initSession();
    } catch (err) {
      Alert.alert("Couldn't verify code", err.message || 'Please check the code and try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <View style={styles.logoWrap}>
        <Logo variant="color" width={220} />
      </View>
      <Text style={styles.subtitle}>Driver Login</Text>

      {step === 'phone' ? (
        <>
          <InputField
            label="Mobile Number"
            value={phone}
            onChangeText={(v) => setPhone(v.replace(/[^\d+]/g, '').slice(0, 13))}
            Icon={Smartphone}
            keyboardType="phone-pad"
            autoCapitalize="none"
            placeholder="10-digit mobile number"
            maxLength={13}
          />
          <Button
            label={loading ? 'Sending…' : 'Send Code'}
            onPress={sendCode}
            loading={loading}
            Icon={LogIn}
            flex={false}
            style={styles.loginBtn}
          />
        </>
      ) : (
        <>
          <Pressable style={styles.backRow} onPress={() => { setStep('phone'); setCode(''); }}>
            <ArrowLeft size={14} color={colors.textMuted} />
            <Text style={styles.backText}>+91 {localTen}</Text>
          </Pressable>
          <InputField
            label="Verification Code"
            value={code}
            onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 8))}
            Icon={KeyRound}
            keyboardType="number-pad"
            placeholder="Code sent via SMS"
          />
          <Button
            label={loading ? 'Verifying…' : 'Verify & Log In'}
            onPress={verifyCode}
            loading={loading}
            Icon={LogIn}
            flex={false}
            style={styles.loginBtn}
          />
          <Pressable style={styles.linkBtn} onPress={sendCode} disabled={loading || cooldown > 0}>
            <Text style={[styles.link, cooldown > 0 && { color: colors.textMuted }]}>
              {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend Code'}
            </Text>
          </Pressable>
        </>
      )}

      <Pressable style={styles.linkBtn} onPress={() => navigation.navigate('Register')}>
        <UserPlus size={16} color={colors.primary} />
        <Text style={styles.link}>New driver? Apply here</Text>
      </Pressable>

      {/* Build stamp — lets you confirm at a glance which APK is installed. */}
      <Text style={styles.buildTag}>Build {BUILD_TAG}</Text>
    </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, justifyContent: 'center', padding: spacing.xl, backgroundColor: colors.background },
  logoWrap:  { alignItems: 'center', justifyContent: 'center', marginBottom: spacing.xs },
  brandRow:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, marginBottom: spacing.xs },
  brandIcon: { width: 48, height: 48, borderRadius: radius.md, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  title:     { ...type.h1, color: colors.text },
  titleAbhi: { fontFamily: 'Montserrat_700Bold', color: colors.text },
  titleCabs: { fontWeight: '500', color: colors.text },
  subtitle:  { ...type.body, color: colors.textMuted, textAlign: 'center', marginBottom: spacing.xl },
  loginBtn:  { alignSelf: 'stretch', marginBottom: spacing.lg },
  linkBtn:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, marginBottom: spacing.md },
  link:      { color: colors.primary, fontWeight: '700' },
  backRow:   { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: spacing.md, alignSelf: 'flex-start' },
  backText:  { color: colors.textMuted, fontSize: 13, fontWeight: '600' },
  buildTag:  { color: colors.textMuted, fontSize: 10.5, textAlign: 'center', marginTop: spacing.lg, opacity: 0.6 },
});
