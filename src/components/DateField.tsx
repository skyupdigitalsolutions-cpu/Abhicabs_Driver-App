// @ts-nocheck
/**
 * DateField — a tap-to-open calendar picker that outputs a 'YYYY-MM-DD' string,
 * matching what the backend expects. Pure JS/React Native (no native module), so
 * it needs no extra dependency, no config plugin, and no special build step — it
 * works identically on Android and iOS.
 *
 * Props:
 *   label        string
 *   value        string   'YYYY-MM-DD' or '' (empty = not set)
 *   onChange     (str) => void   called with 'YYYY-MM-DD' or '' (on Clear)
 *   Icon         LucideIcon
 *   placeholder  string
 *   style        ViewStyle (e.g. half-width in a row)
 */
import React, { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react-native';
import { colors, radius, spacing } from '../theme';

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const pad = (n) => String(n).padStart(2, '0');
// Build the string from numbers directly — never toISOString(), which shifts by
// timezone and can land the date on the previous day.
const fmt = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;

function parse(v) {
  if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const [y, m, d] = v.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
  return { y, m: m - 1, d };
}

export function DateField({ label, value, onChange, Icon, placeholder = 'Select date', style }) {
  const [open, setOpen] = useState(false);
  const today = new Date();
  const sel = parse(value);
  const [viewY, setViewY] = useState(sel ? sel.y : today.getFullYear());
  const [viewM, setViewM] = useState(sel ? sel.m : today.getMonth());

  function openPicker() {
    const s = parse(value);
    setViewY(s ? s.y : today.getFullYear());
    setViewM(s ? s.m : today.getMonth());
    setOpen(true);
  }
  const prevMonth = () => (viewM === 0 ? (setViewM(11), setViewY((y) => y - 1)) : setViewM((m) => m - 1));
  const nextMonth = () => (viewM === 11 ? (setViewM(0), setViewY((y) => y + 1)) : setViewM((m) => m + 1));
  const pick = (d) => { onChange(fmt(viewY, viewM, d)); setOpen(false); };
  const clear = () => { onChange(''); setOpen(false); };

  const firstDow = new Date(viewY, viewM, 1).getDay();
  const daysInMonth = new Date(viewY, viewM + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <View style={[styles.wrapper, style]}>
      {label ? <Text style={styles.label}>{label}</Text> : null}

      <Pressable style={styles.field} onPress={openPicker}>
        {Icon && <Icon size={17} color={colors.textMuted} style={styles.icon} />}
        <Text style={[styles.value, !value && styles.placeholder]} numberOfLines={1}>
          {value || placeholder}
        </Text>
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        {/* Tap outside to dismiss; inner Pressable swallows taps so they don't close it. */}
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.card} onPress={() => {}}>
            <View style={styles.header}>
              <Pressable onPress={() => setViewY((y) => y - 1)} hitSlop={8} style={styles.navBtn}>
                <ChevronsLeft size={20} color={colors.text} />
              </Pressable>
              <Pressable onPress={prevMonth} hitSlop={8} style={styles.navBtn}>
                <ChevronLeft size={22} color={colors.text} />
              </Pressable>
              <Text style={styles.monthTitle}>{MONTHS[viewM]} {viewY}</Text>
              <Pressable onPress={nextMonth} hitSlop={8} style={styles.navBtn}>
                <ChevronRight size={22} color={colors.text} />
              </Pressable>
              <Pressable onPress={() => setViewY((y) => y + 1)} hitSlop={8} style={styles.navBtn}>
                <ChevronsRight size={20} color={colors.text} />
              </Pressable>
            </View>

            <View style={styles.weekRow}>
              {WEEKDAYS.map((w) => <Text key={w} style={styles.weekday}>{w}</Text>)}
            </View>

            <View style={styles.grid}>
              {cells.map((d, i) => {
                if (!d) return <View key={i} style={styles.cell} />;
                const isSel = sel && d === sel.d && viewM === sel.m && viewY === sel.y;
                const isToday = d === today.getDate() && viewM === today.getMonth() && viewY === today.getFullYear();
                return (
                  <View key={i} style={styles.cell}>
                    <Pressable
                      onPress={() => pick(d)}
                      style={[styles.day, isSel && styles.daySel, !isSel && isToday && styles.dayToday]}
                    >
                      <Text style={[styles.dayText, isSel && styles.dayTextSel]}>{d}</Text>
                    </Pressable>
                  </View>
                );
              })}
            </View>

            <View style={styles.actions}>
              <Pressable onPress={clear} style={styles.actionBtn} hitSlop={6}>
                <Text style={styles.clearText}>Clear</Text>
              </Pressable>
              <Pressable onPress={() => setOpen(false)} style={styles.actionBtn} hitSlop={6}>
                <Text style={styles.cancelText}>Cancel</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { marginBottom: spacing.md },
  label: { fontSize: 13, fontWeight: '700', color: colors.text, marginBottom: spacing.xs },
  field: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.md,
    backgroundColor: colors.surface, paddingHorizontal: spacing.md, minHeight: 46,
  },
  icon: { marginRight: spacing.sm },
  value: { flex: 1, fontSize: 15, color: colors.text, paddingVertical: spacing.sm },
  placeholder: { color: colors.textMuted },

  backdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center', justifyContent: 'center', padding: spacing.xl,
  },
  card: {
    width: '100%', maxWidth: 360, backgroundColor: colors.background,
    borderRadius: radius.lg, padding: spacing.lg,
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md },
  navBtn: { padding: spacing.xs },
  monthTitle: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '700', color: colors.text },

  weekRow: { flexDirection: 'row', marginBottom: spacing.xs },
  weekday: { flex: 1, textAlign: 'center', fontSize: 12, fontWeight: '700', color: colors.textMuted },

  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
  day: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  daySel: { backgroundColor: colors.primary },
  dayToday: { borderWidth: 1, borderColor: colors.primary },
  dayText: { fontSize: 15, color: colors.text },
  dayTextSel: { color: colors.primaryText, fontWeight: '700' },

  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.lg, marginTop: spacing.md },
  actionBtn: { paddingVertical: spacing.xs, paddingHorizontal: spacing.sm },
  clearText: { fontSize: 15, fontWeight: '700', color: colors.danger },
  cancelText: { fontSize: 15, fontWeight: '700', color: colors.textMuted },
});
