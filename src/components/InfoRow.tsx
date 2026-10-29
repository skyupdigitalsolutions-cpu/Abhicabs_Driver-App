// @ts-nocheck
/**
 * InfoRow — a single icon + label + value row inside a card.
 * Used in ProfileScreen and ApplicationPendingScreen.
 *
 * Usage:
 *   <InfoRow Icon={Phone}  label="Phone"  value={profile.user?.phone} />
 *   <InfoRow Icon={Shield} label="Status" value="APPROVED" last />
 *
 *   // Icon-only mode (no label/value — just icon + text inline):
 *   <InfoRow Icon={CheckCircle} iconColor={colors.success} text="Application received" />
 */
import { StyleSheet, Text, View } from 'react-native';
import { colors, spacing } from '../theme';

export function InfoRow({ Icon, iconColor, label, value, text, last }) {
  // Inline mode: just icon + single text string
  if (text !== undefined) {
    return (
      <View style={styles.inlineRow}>
        {Icon && <Icon size={18} color={iconColor ?? colors.primary} />}
        <Text style={styles.inlineText}>{text}</Text>
      </View>
    );
  }

  // Label + value mode
  return (
    <View style={[styles.row, !last && styles.border]}>
      {Icon && <Icon size={16} color={iconColor ?? colors.primary} />}
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value ?? '—'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingVertical: spacing.md, paddingHorizontal: spacing.lg,
  },
  border: { borderBottomWidth: 1, borderBottomColor: colors.border },
  label: { flex: 1, color: colors.textMuted, fontSize: 13 },
  value: { color: colors.text, fontWeight: '700', fontSize: 13 },
  inlineRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  inlineText: { fontSize: 14, color: colors.text, flex: 1 },
});
