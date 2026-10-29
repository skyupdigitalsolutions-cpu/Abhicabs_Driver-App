// @ts-nocheck
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Clock, CheckCircle, Bell, ArrowLeft, AlertTriangle, FileText } from 'lucide-react-native';
import { colors, spacing, type } from '../theme';
import { Button }  from '../components/Button';
import { Logo }    from '../components/Logo';
import { InfoRow } from '../components/InfoRow';
import { logout, useSession } from '../store/session';

/**
 * Shown once the driver's documents are all on the server and the account
 * isn't approved yet.
 *
 * FIXES:
 *   • "Check approval status" gave no feedback when nothing had changed —
 *     it looked broken. It now shows a spinner and says the result.
 *   • A REJECTED application looked identical to one under review, with no
 *     way to act on it. It now says so and links back to the documents.
 *   • A driver who uploaded every document but closed the app before tapping
 *     "Submit Application" landed here with no way to submit. "Review my
 *     documents" reopens the upload screen (which has the Submit button).
 */
export function ApplicationPendingScreen() {
  const navigation = useNavigation();
  const { refresh, onboarding } = useSession();
  const [checking, setChecking] = useState(false);
  const kyc = String(onboarding?.kycStatus || '').toUpperCase();
  const rejected = kyc === 'REJECTED';

  async function checkStatus() {
    if (checking) return;
    setChecking(true);
    try {
      const ok = await refresh();
      // If approved, Root swaps to the main app and this screen unmounts.
      if (ok === false) {
        Alert.alert("Couldn't check", 'Please check your connection and try again.');
      } else {
        Alert.alert('Still under review', "Your application hasn't been approved yet. We'll notify you as soon as it is.");
      }
    } finally {
      setChecking(false);
    }
  }

  return (
    <View style={styles.container}>
      <Logo variant="color" width={180} style={{ marginBottom: spacing.xl }} />
      <View style={[styles.iconCircle, rejected && { borderColor: colors.danger }]}>
        {rejected
          ? <AlertTriangle size={48} color={colors.danger} />
          : <Clock size={48} color={colors.primary} />}
      </View>
      <Text style={styles.title}>{rejected ? 'Action needed' : 'Application Submitted'}</Text>
      <Text style={styles.body}>
        {rejected
          ? 'Your application was not approved. Please check and re-upload your documents, then submit again. Contact support if you need help.'
          : "Thanks for applying — our team will review your documents and details. You'll be able to use the app once your account is approved."}
      </Text>

      {!rejected && (
        <View style={styles.infoCard}>
          <InfoRow Icon={CheckCircle} iconColor={colors.success} text="Application received" />
          <InfoRow Icon={Clock}       iconColor={colors.primary}  text="KYC review in progress (24–48 hrs)" />
          <InfoRow Icon={Bell}        iconColor={colors.textMuted} text="You'll be notified once approved" />
        </View>
      )}

      <Button
        label={checking ? 'Checking…' : 'Check approval status'}
        loading={checking}
        flex={false}
        style={styles.btn}
        onPress={checkStatus}
      />

      <Pressable style={styles.link} onPress={() => navigation.navigate('DocumentUpload')}>
        <FileText size={15} color={colors.primary} />
        <Text style={styles.linkText}>
          {rejected ? 'Re-upload my documents' : "Review my documents / haven't submitted yet?"}
        </Text>
      </Pressable>

      <Button
        label="Log out"
        Icon={ArrowLeft}
        variant="secondary"
        flex={false}
        style={[styles.btn, { marginTop: spacing.sm }]}
        onPress={logout}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container:  { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, backgroundColor: colors.background },
  iconCircle: { width: 96, height: 96, borderRadius: 48, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.lg, borderWidth: 2, borderColor: colors.primary },
  title:      { ...type.h1, color: colors.text, textAlign: 'center', marginBottom: spacing.sm },
  body:       { ...type.body, color: colors.textMuted, textAlign: 'center', marginBottom: spacing.xl, lineHeight: 22 },
  infoCard:   { backgroundColor: colors.surface, borderRadius: 12, padding: spacing.lg, borderWidth: 1, borderColor: colors.border, width: '100%', marginBottom: spacing.xl, gap: spacing.md },
  btn:        { paddingHorizontal: spacing.xl, alignSelf: 'stretch' },
  link:       { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.md, marginBottom: spacing.sm },
  linkText:   { color: colors.primary, fontWeight: '700', fontSize: 13 },
});
