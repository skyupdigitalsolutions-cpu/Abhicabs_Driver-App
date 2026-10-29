// @ts-nocheck
/**
 * InputField — labeled text input with a leading icon and optional password toggle.
 *
 * Props:
 *   label        string       Field label above the input
 *   Icon         LucideIcon   Leading icon
 *   secureToggle boolean      Adds show/hide eye button for password fields
 *   style        ViewStyle    Wrapper style
 *   ...props                  All standard TextInput props
 */
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Eye, EyeOff } from 'lucide-react-native';
import { colors, radius, spacing, type } from '../theme';

export function InputField({ label, Icon, secureToggle = false, style, ...props }) {
  const [hidden, setHidden] = useState(true);

  // When secureToggle is active, we own secureTextEntry — strip it from props to avoid conflict
  const { secureTextEntry: _ignored, ...rest } = props;

  return (
    <View style={[styles.wrapper, style]}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View style={styles.row}>
        {Icon && <Icon size={17} color={colors.textMuted} style={styles.icon} />}
        <TextInput
          style={styles.input}
          placeholderTextColor={colors.textMuted}
          secureTextEntry={secureToggle ? hidden : (props.secureTextEntry ?? false)}
          {...rest}
        />
        {secureToggle && (
          <Pressable onPress={() => setHidden((v) => !v)} style={styles.eyeBtn}>
            {hidden
              ? <Eye    size={17} color={colors.textMuted} />
              : <EyeOff size={17} color={colors.textMuted} />
            }
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { marginBottom: spacing.md },
  label:   { ...type.label, color: colors.text, marginBottom: spacing.xs },
  row: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.md,
    backgroundColor: colors.surface, paddingHorizontal: spacing.md,
  },
  icon:   { marginRight: spacing.sm },
  input:  { flex: 1, fontSize: 15, color: colors.text, paddingVertical: spacing.sm },
  eyeBtn: { padding: spacing.xs },
});
