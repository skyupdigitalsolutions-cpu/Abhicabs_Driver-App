// @ts-nocheck
/**
 * AddChargeSection — lets driver add extra charges (toll, parking, etc.) during a trip.
 * Uses shared Card, ChipGroup components. Uses plain Pressable for icon-only trash action.
 */
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Plus, Trash2, Receipt, IndianRupee } from 'lucide-react-native';
import { colors, radius, spacing, type } from '../theme';
import { Card } from './Card';
import { Button } from './Button';
import { ChipGroup } from './ChipGroup';

const CHARGE_OPTIONS = [
  { value: 'Toll',           label: 'Toll'           },
  { value: 'Parking',        label: 'Parking'        },
  { value: 'Waiting charge', label: 'Waiting charge' },
  { value: 'State permit',   label: 'State permit'   },
  { value: 'Other',          label: 'Other'          },
];

export function AddChargeSection() {
  const [label, setLabel]   = useState(CHARGE_OPTIONS[0].value);
  const [amount, setAmount] = useState('');
  const [items, setItems]   = useState([]);

  const total = items.reduce((s, i) => s + i.amount, 0);

  function addItem() {
    const value = Number(amount);
    if (!value || value <= 0) return;
    setItems((prev) => [...prev, { label, amount: value }]);
    setAmount('');
  }

  function removeItem(index) {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  function handleSubmit() {
    Alert.alert(
      'Not available yet',
      "Extra charges can't be submitted directly yet — please inform dispatch by phone."
    );
  }

  return (
    <Card Icon={Receipt} title="Add extra charges"
      hint="Tolls, parking, waiting time — anything beyond the metered fare. Note: these can't be submitted from the app yet, so report the total to dispatch by phone.">

      <ChipGroup options={CHARGE_OPTIONS} value={label} onChange={setLabel} />

      {/* Amount row */}
      <View style={styles.amountRow}>
        <View style={styles.amountInput}>
          <IndianRupee size={15} color={colors.textMuted} />
          <TextInput
            style={styles.amountText}
            keyboardType="decimal-pad"
            placeholder="Amount"
            placeholderTextColor={colors.textMuted}
            value={amount}
            onChangeText={setAmount}
          />
        </View>
        <Button
          label="Add"
          variant="secondary"
          Icon={Plus}
          flex={false}
          style={styles.addBtn}
          onPress={addItem}
        />
      </View>

      {/* Added items */}
      {items.length > 0 && (
        <View style={styles.itemsList}>
          {items.map((item, i) => (
            <View key={i} style={styles.itemRow}>
              <Text style={styles.itemLabel}>{item.label}</Text>
              <View style={styles.itemRight}>
                <Text style={styles.itemAmount}>₹{item.amount}</Text>
                {/* Plain Pressable for icon-only delete — Button is overkill here */}
                <Pressable onPress={() => removeItem(i)} style={styles.removeBtn} hitSlop={8}>
                  <Trash2 size={16} color={colors.danger} />
                </Pressable>
              </View>
            </View>
          ))}
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total extra charges</Text>
            <View style={styles.totalRight}>
              <IndianRupee size={14} color={colors.primary} />
              <Text style={styles.totalAmount}>{total}</Text>
            </View>
          </View>
        </View>
      )}

      <Button
        label="Submit to trip"
        variant="ghost"
        Icon={Receipt}
        flex={false}
        disabled={items.length === 0}
        style={[styles.submitBtn, items.length === 0 && styles.submitDisabled]}
        onPress={handleSubmit}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  amountRow:   { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  amountInput: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.md,
    paddingHorizontal: spacing.md, backgroundColor: colors.background,
  },
  amountText:  { flex: 1, fontSize: 15, color: colors.text, paddingVertical: spacing.sm },
  addBtn:      { paddingHorizontal: spacing.lg },
  itemsList:   { marginBottom: spacing.md },
  itemRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  itemLabel:   { flex: 1, fontSize: 13, color: colors.text },
  itemRight:   { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  itemAmount:  { fontSize: 13, fontWeight: '700', color: colors.text },
  removeBtn:   { padding: 4 },
  totalRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginTop: spacing.sm, paddingTop: spacing.sm,
  },
  totalLabel:  { ...type.label, color: colors.text },
  totalRight:  { flexDirection: 'row', alignItems: 'center' },
  totalAmount: { ...type.label, color: colors.primary, fontSize: 15 },
  submitBtn:   { alignSelf: 'stretch', borderWidth: 1, borderColor: colors.primary, borderRadius: radius.md },
  submitDisabled: { borderColor: colors.border },
});
