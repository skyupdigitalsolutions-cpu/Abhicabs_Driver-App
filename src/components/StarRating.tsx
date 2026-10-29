// @ts-nocheck
/**
 * src/components/StarRating.jsx
 *
 * One component, two modes:
 *   • Display  — <StarRating value={4.5} size={16} />        read-only, supports halves
 *   • Input    — <StarRating value={n} onChange={setN} />    tappable 1–5, whole stars
 *
 * Amber fill uses the app's primary colour so it matches the brand.
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Star } from 'lucide-react-native';
import { colors, spacing } from '../theme';

export function StarRating({
  value = 0,
  onChange,
  size = 20,
  max = 5,
  showNumber = false,
  style,
}) {
  const interactive = typeof onChange === 'function';
  const rating = Number(value) || 0;

  return (
    <View style={[styles.row, style]}>
      {Array.from({ length: max }).map((_, i) => {
        const idx = i + 1;
        // Display mode supports half-fill; input mode is whole-star only.
        const filled = interactive ? idx <= Math.round(rating) : idx <= Math.floor(rating);
        const half = !interactive && !filled && idx - 0.5 <= rating;

        const StarIcon = (
          <View style={styles.starBox}>
            {/* Empty base */}
            <Star size={size} color={colors.border} fill={colors.surfaceAlt} />
            {/* Filled overlay (full or clipped to half) */}
            {(filled || half) && (
              <View style={[styles.overlay, half && { width: size / 2 }]}>
                <Star size={size} color={colors.primary} fill={colors.primary} />
              </View>
            )}
          </View>
        );

        return interactive ? (
          <Pressable key={idx} onPress={() => onChange(idx)} hitSlop={6} style={styles.tap}>
            {StarIcon}
          </Pressable>
        ) : (
          <View key={idx}>{StarIcon}</View>
        );
      })}

      {showNumber && rating > 0 && (
        <Text style={styles.number}>{rating.toFixed(1)}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row:      { flexDirection: 'row', alignItems: 'center', gap: 2 },
  tap:      { padding: 2 },
  starBox:  { position: 'relative' },
  overlay:  { position: 'absolute', top: 0, left: 0, overflow: 'hidden' },
  number:   { marginLeft: spacing.sm, fontSize: 14, fontWeight: '700', color: colors.text },
});
