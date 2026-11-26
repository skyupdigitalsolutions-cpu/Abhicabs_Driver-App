// @ts-nocheck
/**
 * StepHeader — title + "Step X of Y — label" + progress bar.
 * Used in RegisterScreen and RegisterVehicleScreen.
 *
 * Usage:
 *   <StepHeader title="Driver Registration" step={step} total={2}
 *     labels={['Personal Details', 'Documents']} />
 */
import { StyleSheet, Text, View } from 'react-native';
import { colors, spacing, type } from '../theme';

export function StepHeader({ title, step, total, labels = [] }) {
  const stepLabel = labels[step - 1] ?? `Step ${step}`;
  const progress = `${Math.round((step / total) * 100)}%`;

  return (
    <View style={styles.wrapper}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.indicator}>
        Step {step} of {total} — {stepLabel}
      </Text>
      <View style={styles.bar}>
        <View style={[styles.fill, { width: progress }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { marginBottom: spacing.lg },
  title: { ...type.h1, color: colors.text, marginBottom: spacing.xs },
  indicator: { ...type.caption, color: colors.textMuted, marginBottom: spacing.sm },
  bar: { height: 4, backgroundColor: colors.border, borderRadius: 2, overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: colors.primary, borderRadius: 2 },
});
