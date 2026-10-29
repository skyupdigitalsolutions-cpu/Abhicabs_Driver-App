// @ts-nocheck
import { Linking, StyleSheet, Text, View } from 'react-native';
import { AlertTriangle, Phone, ShieldAlert } from 'lucide-react-native';
import { colors, spacing, type } from '../theme';
import { Button } from '../components/Button';
import { Logo } from '../components/Logo';

// FIX: the support number was hardcoded here, duplicating (and silently
// ignoring) EXPO_PUBLIC_SUPPORT_PHONE, which is already defined in .env but
// was never actually read anywhere in the app. Changing that env var for a
// different deployment/region would have had no effect — this screen would
// keep calling the old number forever. Falls back to the same number only
// if the env var is somehow unset, so nothing breaks if .env is missing it.
import { SUPPORT_PHONE } from '../config';

export function SOSScreen() {
  return (
    <View style={styles.container}>
      <Logo variant="color" width={150} style={{ marginBottom: spacing.xl }} />
      <View style={styles.iconCircle}>
        <AlertTriangle size={44} color={colors.danger} />
      </View>
      <Text style={styles.title}>Emergency</Text>
      <Text style={styles.body}>
        If you're in danger or need urgent help, call one of the numbers below immediately.
      </Text>
      <Button
        label="Call Police (112)"
        variant="danger"
        Icon={ShieldAlert}
        flex={false}
        style={styles.btn}
        onPress={() => Linking.openURL('tel:112')}
      />
      <Button
        label="Call ABHI CABS Support"
        variant="secondary"
        Icon={Phone}
        flex={false}
        style={styles.btn}
        onPress={() => Linking.openURL(`tel:${SUPPORT_PHONE}`)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container:  { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, backgroundColor: colors.background },
  iconCircle: { width: 96, height: 96, borderRadius: 48, backgroundColor: '#FEE2E2', alignItems: 'center', justifyContent: 'center', marginBottom: spacing.md },
  title:      { ...type.h1, color: colors.text, marginBottom: spacing.sm },
  body:       { ...type.body, color: colors.textMuted, textAlign: 'center', marginBottom: spacing.xl, lineHeight: 22 },
  btn:        { width: '100%', marginBottom: spacing.md },
});
