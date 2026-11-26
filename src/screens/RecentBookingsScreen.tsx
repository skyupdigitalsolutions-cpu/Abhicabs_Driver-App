// @ts-nocheck
/**
 * RecentBookingsScreen — the driver's finished trips.
 *
 * FIX: this screen read `state.recentActions.items`, but recentActionsSlice
 * was deleted (accept/decline no longer exists), so opening it crashed with
 * "Cannot read property 'items' of undefined". It now shows finished trips
 * from the same driver-scoped list the Trips tab uses.
 */
import { useEffect } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useDispatch, useSelector } from 'react-redux';
import { ClipboardList, ChevronRight } from 'lucide-react-native';
import { colors, radius, spacing, type } from '../theme';
import { fetchTrips } from '../store/tripsSlice';

const FINISHED = ['COMPLETED', 'CANCELLED', 'EXPIRED'];

export function RecentBookingsScreen() {
  const navigation = useNavigation();
  const dispatch = useDispatch();
  const { items, status } = useSelector((s) => s.trips);
  const finished = items.filter((t) => FINISHED.includes(t.status));

  useEffect(() => {
    if (status === 'idle') dispatch(fetchTrips({ page: 1, replace: true }));
  }, []);

  if (status === 'loading' && items.length === 0) {
    return <View style={styles.empty}><ActivityIndicator size="large" color={colors.primary} /></View>;
  }

  if (finished.length === 0) {
    return (
      <View style={styles.empty}>
        <ClipboardList size={40} color={colors.border} />
        <Text style={styles.emptyText}>No finished trips yet.</Text>
      </View>
    );
  }

  return (
    <FlatList
      data={finished}
      keyExtractor={(t, i) => String(t.id ?? i)}
      contentContainerStyle={styles.list}
      renderItem={({ item: t }) => {
        const pickup = t.pickup?.address || t.pickupAddress?.address || (typeof t.pickupAddress === 'string' ? t.pickupAddress : '') || 'Pickup';
        const drop = t.drop?.address || t.dropAddress?.address || (typeof t.dropAddress === 'string' ? t.dropAddress : '') || 'Drop';
        const fare = t.finalFare ?? t.estimatedFare;
        const when = t.pickupAt
          ? new Date(t.pickupAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
          : '';
        return (
          <Pressable style={styles.row} onPress={() => navigation.navigate('Trip', { bookingId: t.id })}>
            <View style={{ flex: 1 }}>
              <Text style={styles.route} numberOfLines={2}>{pickup} → {drop}</Text>
              <Text style={styles.meta}>{String(t.status).replace(/_/g, ' ')}{when ? ` · ${when}` : ''}</Text>
            </View>
            {fare != null && <Text style={styles.fare}>₹{fare}</Text>}
            <ChevronRight size={16} color={colors.textMuted} />
          </Pressable>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  list:      { padding: spacing.lg },
  row:       { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: spacing.sm },
  route:     { fontSize: 13, fontWeight: '600', color: colors.text },
  meta:      { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  fare:      { fontSize: 14, fontWeight: '700', color: colors.text },
  empty:     { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.xl },
  emptyText: { ...type.body, color: colors.textMuted, textAlign: 'center' },
});
