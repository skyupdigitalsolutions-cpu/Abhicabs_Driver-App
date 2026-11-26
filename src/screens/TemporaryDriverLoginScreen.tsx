// @ts-nocheck
/**
 * TemporaryDriverLoginScreen.jsx
 *
 * Mobile-number + OTP sign-in for TEMPORARY driver accounts (created by admin in
 * the ERP — see driverService.createTemporary there). Uses the same mobile-OTP
 * flow as the regular LoginScreen (authApi.requestOtp / verifyOtp). Email-OTP
 * login has been removed from the app.
 *
 * NOTE: this screen is a drop-in and is not currently wired into AuthNavigator.
 * To enable it:
 *   1. In App.tsx's AuthNavigator, add:
 *        <AuthStack.Screen name="TemporaryDriverLogin" component={TemporaryDriverLoginScreen} />
 *   2. On LoginScreen, add a link/button:
 *        <TouchableOpacity onPress={() => navigation.navigate('TemporaryDriverLogin')}>
 *          <Text>Substitute / temporary driver? Sign in</Text>
 *        </TouchableOpacity>
 *   3. Swap the bare View/Text/TextInput below for the shared Card/Button/theme
 *      components if you want it to match the rest of the app.
 */
import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, Alert, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { authApi } from '../api/endpoints';
import { initSession } from '../store/session';

export function TemporaryDriverLoginScreen() {
  const [phone, setPhone]     = useState('');
  const [code, setCode]       = useState('');
  const [stage, setStage]     = useState('phone'); // 'phone' | 'otp'
  const [loading, setLoading] = useState(false);

  const digitsOnly = phone.replace(/\D/g, '');
  const localTen   = digitsOnly.length > 10 ? digitsOnly.slice(-10) : digitsOnly;
  const isValidPhone = /^[6-9]\d{9}$/.test(localTen);

  async function requestCode() {
    if (!isValidPhone) return Alert.alert('Enter a valid 10-digit mobile number');
    setLoading(true);
    try {
      await authApi.requestOtp(localTen);
      setStage('otp');
    } catch (e) {
      Alert.alert('Could not send code', e.message || 'Please try again.');
    } finally {
      setLoading(false);
    }
  }

  async function verifyCode() {
    if (!/^\d{4,6}$/.test(code.trim())) return Alert.alert('Enter the code from the SMS');
    setLoading(true);
    try {
      await authApi.verifyOtp(localTen, code.trim());
      // Tokens are now stored (verifyOtp calls setTokens) — re-run session init
      // so App.tsx's Root() picks up the new session and routes by driverType.
      await initSession();
    } catch (e) {
      Alert.alert('Incorrect code', e.message || 'Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
      <View style={styles.container}>
        <Text style={styles.title}>Temporary Driver Sign-in</Text>
        <Text style={styles.subtitle}>
          {stage === 'phone'
            ? "Enter the mobile number your admin registered you with. We'll send a one-time code by SMS."
            : `Enter the code sent to +91 ${localTen}.`}
        </Text>

        {stage === 'phone' ? (
          <>
            <TextInput
              style={styles.input}
              value={phone}
              onChangeText={(t) => setPhone(t.replace(/[^\d+]/g, '').slice(0, 13))}
              placeholder="10-digit mobile number"
              autoCapitalize="none"
              keyboardType="phone-pad"
              maxLength={13}
              autoFocus
            />
            <TouchableOpacity style={[styles.button, (!isValidPhone || loading) && styles.buttonDisabled]}
              disabled={!isValidPhone || loading} onPress={requestCode}>
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Send code</Text>}
            </TouchableOpacity>
          </>
        ) : (
          <>
            <TextInput
              style={[styles.input, styles.otpInput]}
              value={code}
              onChangeText={(t) => setCode(t.replace(/\D/g, '').slice(0, 6))}
              placeholder="Enter code"
              keyboardType="number-pad"
              maxLength={6}
              autoFocus
            />
            <TouchableOpacity style={[styles.button, loading && styles.buttonDisabled]} disabled={loading} onPress={verifyCode}>
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Verify & Sign in</Text>}
            </TouchableOpacity>
            <TouchableOpacity style={styles.linkButton} onPress={() => { setStage('phone'); setCode(''); }}>
              <Text style={styles.linkText}>Use a different number</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

export default TemporaryDriverLoginScreen;

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: '#fff' },
  title: { fontSize: 22, fontWeight: '800', color: '#1F2937', marginBottom: 8, textAlign: 'center' },
  subtitle: { fontSize: 14, color: '#6B7280', marginBottom: 24, textAlign: 'center', lineHeight: 20 },
  input: { borderWidth: 1.5, borderColor: '#E5E7EB', borderRadius: 10, padding: 14, fontSize: 16, marginBottom: 16, color: '#1F2937' },
  otpInput: { textAlign: 'center', fontSize: 24, letterSpacing: 6, fontWeight: '700' },
  button: { backgroundColor: '#111111', borderRadius: 10, padding: 14, alignItems: 'center' },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  linkButton: { marginTop: 16, alignItems: 'center' },
  linkText: { color: '#111111', fontWeight: '600', fontSize: 13.5 },
});
