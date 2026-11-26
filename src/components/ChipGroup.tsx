// @ts-nocheck
/**
 * ChipGroup — horizontal scrollable set of selectable chips.
 *
 * Usage:
 *   const OPTIONS = [
 *     { value: 'sedan', label: 'Sedan' },
 *     { value: 'suv',   label: 'SUV'   },
 *   ];
 *   <ChipGroup options={OPTIONS} value={vehicleClass} onChange={setVehicleClass} />
 *
 *   // With per-chip icons:
 *   <ChipGroup options={OPTIONS} value={fuelType} onChange={setFuelType} Icon={Fuel} />
 */
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing } from '../theme';

export function ChipGroup({ options, value, onChange, Icon, style }) {
  return (
    <View style={[styles.wrapper, style]}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {options.map((opt) => {
          const active = opt.value === value;
          return (
            <Pressable
              key={opt.value}
              onPress={() => onChange(opt.value)}
              style={[styles.chip, active && styles.chipActive]}
            >
              {Icon && <Icon size={13} color={active ? colors.primaryText : colors.text} />}
              <Text style={[styles.label, active && styles.labelActive]}>{opt.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { marginBottom: spacing.md },
  row: { flexDirection: 'row', gap: spacing.sm, paddingVertical: 2 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  label: { fontSize: 13, color: colors.text, fontWeight: '600' },
  labelActive: { color: colors.primaryText },
});
