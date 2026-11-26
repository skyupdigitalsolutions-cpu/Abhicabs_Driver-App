// @ts-nocheck
/**
 * ScreenPlaceholder — centered icon + title + body + optional coming-soon list.
 * Used for Earnings, Trips, and any future stub screens.
 *
 * Props:
 *   Icon       LucideIcon
 *   iconColor  string        default: colors.primary
 *   iconSize   number        default: 40
 *   title      string
 *   body       string
 *   items      Array<{ Icon: LucideIcon, text: string }>
 */
import { StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, type } from '../theme';

export function ScreenPlaceholder({ Icon, iconColor, iconSize = 40, title, body, items = [] }) {
  return (
    <View style={styles.container}>
      <View style={styles.iconCircle}>
        {Icon && <Icon size={iconSize} color={iconColor ?? colors.primary} />}
      </View>
      <Text style={styles.title}>{title}</Text>
      {body ? <Text style={styles.body}>{body}</Text> : null}

      {items.length > 0 && (
        <View style={styles.list}>
          {items.map((item, i) => {
            // Must assign to uppercase variable for JSX to treat it as a component
            const ItemIcon = item.Icon;
            return (
              <View key={i} style={styles.listRow}>
                {ItemIcon && <ItemIcon size={18} color={colors.textMuted} />}
                <Text style={styles.listText}>{item.text}</Text>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    padding: spacing.xl, backgroundColor: colors.background,
  },
  iconCircle: {
    width: 80, height: 80, borderRadius: 40, backgroundColor: colors.surfaceAlt,
    alignItems: 'center', justifyContent: 'center', marginBottom: spacing.md,
  },
  title:    { ...type.h2, color: colors.text, textAlign: 'center', marginBottom: spacing.xs },
  body:     { ...type.body, color: colors.textMuted, textAlign: 'center', marginBottom: spacing.xl },
  list: {
    backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg,
    borderWidth: 1, borderColor: colors.border, width: '100%',
  },
  listRow:  { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  listText: { fontSize: 14, color: colors.textMuted, flex: 1 },
});
