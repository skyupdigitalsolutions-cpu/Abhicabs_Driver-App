// @ts-nocheck
/**
 * Card — surface container with optional header row (icon + title).
 *
 * Usage:
 *   <Card>…children…</Card>
 *   <Card Icon={Route} title="Record actual distance" hint="Enter km…">…</Card>
 *   <Card style={{ marginBottom: 0 }}>…</Card>
 */
import { StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, type } from '../theme';

export function Card({ Icon, title, hint, style, children }) {
  return (
    <View style={[styles.card, style]}>
      {(Icon || title) && (
        <View style={styles.header}>
          {Icon && <Icon size={18} color={colors.primary} />}
          {title && <Text style={styles.title}>{title}</Text>}
        </View>
      )}
      {hint && <Text style={styles.hint}>{hint}</Text>}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.lg,
    // Subtle depth so cards read as distinct surfaces on the dashboard
    // instead of flat outlined boxes — kept light so it stays clean, not
    // heavy/skeuomorphic.
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xs },
  title: { ...type.h2, color: colors.text },
  hint: { ...type.caption, color: colors.textMuted, marginBottom: spacing.md, lineHeight: 18 },
});
