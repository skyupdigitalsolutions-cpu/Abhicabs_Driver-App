// @ts-nocheck
/**
 * Button — primary, secondary, danger, ghost variants with loading state and optional icons.
 *
 * Props:
 *   label       string        Button text (omit or pass '' for icon-only)
 *   onPress     function
 *   variant     'primary' | 'secondary' | 'danger' | 'ghost'   default: 'primary'
 *   Icon        LucideIcon    Left icon component
 *   IconRight   LucideIcon    Right icon component
 *   loading     boolean       Shows ActivityIndicator, disables press
 *   disabled    boolean
 *   flex        boolean       true = flex:1 (fill row), false = size-to-content  default: true
 *   style       ViewStyle     Extra styles merged onto the Pressable
 */
import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing } from '../theme';

const VARIANTS = {
  primary:   { bg: colors.primary,    textColor: colors.primaryText },
  secondary: { bg: colors.surfaceAlt, textColor: colors.text,        border: true },
  danger:    { bg: colors.danger,     textColor: '#ffffff' },
  ghost:     { bg: 'transparent',     textColor: colors.primary },
};

export function Button({
  label,
  onPress,
  variant = 'primary',
  Icon,
  IconRight,
  loading = false,
  disabled = false,
  flex = true,
  style,
}) {
  const v = VARIANTS[variant] || VARIANTS.primary;
  const isDisabled = disabled || loading;

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={[
        styles.base,
        { backgroundColor: v.bg },
        v.border && styles.border,
        flex === true && styles.flex,
        isDisabled && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={v.textColor} />
      ) : (
        <View style={styles.inner}>
          {Icon      && <Icon      size={18} color={v.textColor} />}
          {!!label   && <Text style={[styles.label, { color: v.textColor }]}>{label}</Text>}
          {IconRight && <IconRight size={18} color={v.textColor} />}
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  flex:     { flex: 1 },
  border:   { borderWidth: 1, borderColor: colors.border },
  disabled: { opacity: 0.5 },
  inner:    { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  label:    { fontWeight: '700', fontSize: 15 },
});
