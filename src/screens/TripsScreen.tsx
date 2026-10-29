// @ts-nocheck
/**
 * TripsScreen — paginated trip list with Redux Toolkit state management.
 *
 * Features:
 *  - Redux store for trips (no re-fetch on tab switch)
 *  - Active / Upcoming / Past tabs (client-side grouping of the same
 *    fetched list — no extra API calls, no new endpoints)
 *  - Pagination — loads 10 at a time, "Load More" at bottom
 *  - Pull-to-refresh resets to page 1
 *  - Status colour badges
 *  - Trip type badge (ONE_WAY / ROUND_TRIP / AIRPORT / HOURLY)
 */
import { useCallback, useState, useMemo } from 'react';
import {
  ActivityIndicator, FlatList, Pressable,
  RefreshControl, StyleSheet, Text, View,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useDispatch, useSelector } from 'react-redux';
import { MapPin, Navigation, Clock, ChevronRight, ClipboardList, RefreshCw } from 'lucide-react-native';
import { colors, radius, spacing, type } from '../theme';
import { fetchTrips } from '../store/tripsSlice';

/**
 * Tabs. Every booking this list returns is already allocated to the driver
 * (GET /driver/bookings), so the old "Upcoming = PENDING/CONFIRMED" tab —
 * the default tab — was always empty. Upcoming is now an allocated trip whose
 * pickup time is still ahead; Active is anything in progress.
 */
const IN_PROGRESS = ['EN_ROUTE', 'REACHED', 'ONGOING', 'ARRIVED'];
const FINISHED    = ['COMPLETED', 'CANCELLED', 'EXPIRED'];
const isUpcoming = (t) =>
  ['PENDING', 'CONFIRMED', 'ALLOCATED'].includes(t.status) &&
  !!t.pickupAt && new Date(t.pickupAt).getTime() > Date.now() + 30 * 60 * 1000;
const TABS = [
  { key: 'active',    label: 'Active',    match: (t) => IN_PROGRESS.includes(t.status) || (t.status === 'ALLOCATED' && !isUpcoming(t)) },
  { key: 'upcoming',  label: 'Upcoming',  match: isUpcoming },
  { key: 'completed', label: 'Past',      match: (t) => FINISHED.includes(t.status) },
];

const STATUS_COLORS = {
  PENDING:   { bg: '#FFF3E0', text: '#E65100' },
  CONFIRMED: { bg: '#E3F2FD', text: '#1565C0' },
  ALLOCATED: { bg: '#E8EAF6', text: '#283593' },
  EN_ROUTE:  { bg: '#E8F5E9', text: '#2E7D32' },
  REACHED:   { bg: '#F3E5F5', text: '#6A1B9A' },
  ONGOING:   { bg: '#E0F2F1', text: '#00695C' },
  ARRIVED:   { bg: '#EDE7F6', text: '#4527A0' },
  COMPLETED: { bg: '#F1F8E9', text: '#33691E' },
  CANCELLED: { bg: '#FFEBEE', text: '#B71C1C' },
  EXPIRED:   { bg: '#F5F5F5', text: '#616161' },
};

const TRIP_TYPE_LABELS = {
  ONE_WAY:    'One Way',
  ROUND_TRIP: 'Round Trip',
  AIRPORT:    'Airport',
  HOURLY:     'Hourly',
};

export function TripsScreen() {
  const navigation = useNavigation();
  const dispatch   = useDispatch();
  const { items, status, hasMore, page, error, total } = useSelector((s) => s.trips);
  const [tab, setTab] = useState('active');
  const [refreshing, setRefreshing] = useState(false);

  // Refetch page 1 whenever the tab screen gains focus, so statuses changed
  // on TripScreen (or by dispatch) are reflected without a manual refresh.
  useFocusEffect(
    useCallback(() => {
      dispatch(fetchTrips({ page: 1, replace: true }));
    }, [dispatch]),
  );

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await dispatch(fetchTrips({ page: 1, replace: true }));
    setRefreshing(false);
  }, [dispatch]);

  const loadMore = useCallback(() => {
    if (status === 'loading' || status === 'loadingMore' || !hasMore) return;
    dispatch(fetchTrips({ page: page + 1, replace: false }));
  }, [dispatch, status, hasMore, page]);

  const filteredItems = useMemo(() => {
    const t = TABS.find((x) => x.key === tab) || TABS[0];
    return items.filter(t.match);
  }, [items, tab]);

  const TabBar = (
    <View style={styles.tabBar}>
      {TABS.map((t) => (
        <Pressable
          key={t.key}
          style={[styles.tabBtn, tab === t.key && styles.tabBtnActive]}
          onPress={() => setTab(t.key)}
        >
          <Text style={[styles.tabText, tab === t.key && styles.tabTextActive]}>{t.label}</Text>
        </Pressable>
      ))}
    </View>
  );

  // First load only — later reloads keep the list on screen.
  if (status === 'loading' && items.length === 0 && !refreshing) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Loading trips…</Text>
      </View>
    );
  }

  if (status === 'failed' && items.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{error || 'Failed to load trips'}</Text>
        <Pressable style={styles.retryBtn} onPress={refresh}>
          <RefreshCw size={16} color={colors.primary} />
          <Text style={styles.retryText}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      {TabBar}
      <FlatList
        data={filteredItems}
        keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={[styles.list, filteredItems.length === 0 && { flexGrow: 1 }]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
        onEndReached={loadMore}
        onEndReachedThreshold={0.3}
        ListEmptyComponent={
          <View style={styles.center}>
            <ClipboardList size={40} color={colors.border} />
            <Text style={styles.emptyTitle}>
              {items.length === 0 ? 'No trips yet' : `No ${TABS.find((t) => t.key === tab)?.label.toLowerCase()} trips`}
            </Text>
            {items.length === 0 && <Text style={styles.emptyBody}>Your assigned trips will appear here.</Text>}
            {hasMore && (
              <Pressable style={styles.retryBtn} onPress={loadMore}>
                <RefreshCw size={16} color={colors.primary} />
                <Text style={styles.retryText}>Load older trips</Text>
              </Pressable>
            )}
          </View>
        }
        ListFooterComponent={
          filteredItems.length > 0 ? (
            <Footer status={status} hasMore={hasMore} total={total} count={items.length} onLoadMore={loadMore} />
          ) : null
        }
        renderItem={({ item }) => (
          <TripCard
            trip={item}
            onPress={() => navigation.navigate('Trip', { bookingId: item.id })}
          />
        )}
      />
    </View>
  );
}

function TripCard({ trip, onPress }) {
  const s      = STATUS_COLORS[trip.status] || STATUS_COLORS.PENDING;
  const pickup = trip.pickup?.address || trip.pickupAddress?.address || (typeof trip.pickupAddress === 'string' ? trip.pickupAddress : '') || '—';
  const drop   = trip.drop?.address   || trip.dropAddress?.address   || (typeof trip.dropAddress === 'string' ? trip.dropAddress : '')   || '—';
  const km     = trip.distanceKm ?? trip.estimatedKm;
  const fare   = trip.finalFare ?? trip.estimatedFare ?? trip.totalFare;
  const customerName = trip.customer?.name || trip.customer?.user?.name;
  const date   = trip.pickupAt
    ? new Date(trip.pickupAt).toLocaleDateString('en-IN', {
        day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
      })
    : '—';
  const typeLabel = TRIP_TYPE_LABELS[trip.tripType] || trip.tripType || '';

  return (
    <Pressable style={styles.card} onPress={onPress}>
      {/* Header row: status + trip type + date + chevron */}
      <View style={styles.cardHeader}>
        <View style={[styles.statusBadge, { backgroundColor: s.bg }]}>
          <Text style={[styles.statusText, { color: s.text }]}>{String(trip.status || '').replace(/_/g, ' ')}</Text>
        </View>
        {!!typeLabel && (
          <View style={styles.typeBadge}>
            <Text style={styles.typeText}>{typeLabel}</Text>
          </View>
        )}
        <View style={styles.dateRow}>
          <Clock size={11} color={colors.textMuted} />
          <Text style={styles.dateText}>{date}</Text>
        </View>
        <ChevronRight size={16} color={colors.textMuted} />
      </View>

      {/* Round trip leg indicator */}
      {trip.tripType === 'ROUND_TRIP' && (
        <View style={styles.roundTripBanner}>
          <Text style={styles.roundTripText}>
            Outbound leg • Return leg managed separately
          </Text>
        </View>
      )}

      {/* Route */}
      <View style={styles.routeBox}>
        <View style={styles.routeRow}>
          <MapPin size={13} color={colors.success} />
          <Text style={styles.routeText} numberOfLines={1}>{pickup}</Text>
        </View>
        <View style={styles.routeDot} />
        <View style={styles.routeRow}>
          <Navigation size={13} color={colors.danger} />
          <Text style={styles.routeText} numberOfLines={1}>{drop}</Text>
        </View>
      </View>

      {/* Meta row */}
      <View style={styles.metaRow}>
        {!!trip.vehicleClass && <Text style={styles.metaText}>{trip.vehicleClass}</Text>}
        {km != null && (
          <>
            <Text style={styles.metaDot}>•</Text>
            <Text style={styles.metaText}>{km} km</Text>
          </>
        )}
        <Text style={styles.metaDot}>•</Text>
        <Text style={styles.fareText}>{fare != null ? `₹${fare}` : '₹—'}</Text>
        {!!trip.paymentMode && (
          <>
            <Text style={styles.metaDot}>•</Text>
            <Text style={styles.metaText}>{trip.paymentMode}</Text>
          </>
        )}
      </View>

      {/* Customer */}
      {!!customerName && (
        <Text style={styles.customerText}>Customer: {customerName}</Text>
      )}
    </Pressable>
  );
}

function Footer({ status, hasMore, total, count, onLoadMore }) {
  if (status === 'loadingMore') {
    return (
      <View style={styles.footer}>
        <ActivityIndicator size="small" color={colors.primary} />
        <Text style={styles.footerText}>Loading more…</Text>
      </View>
    );
  }
  if (hasMore) {
    return (
      <Pressable style={styles.loadMoreBtn} onPress={onLoadMore}>
        <Text style={styles.loadMoreText}>Load more trips</Text>
      </Pressable>
    );
  }
  if (count > 0) {
    return (
      <Text style={styles.endText}>
        Showing {count} of {total} trips
      </Text>
    );
  }
  return null;
}

const styles = StyleSheet.create({
  list:            { padding: spacing.lg },
  tabBar:          { flexDirection: 'row', backgroundColor: colors.background, paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.sm, gap: spacing.sm },
  tabBtn:          { flex: 1, alignItems: 'center', paddingVertical: spacing.sm, borderRadius: radius.pill, backgroundColor: colors.surface },
  tabBtnActive:    { backgroundColor: colors.primary },
  tabText:         { fontSize: 13, fontWeight: '600', color: colors.textMuted },
  tabTextActive:   { color: colors.primaryText, fontWeight: '700' },
  center:          { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, backgroundColor: colors.background },
  loadingText:     { ...type.caption, color: colors.textMuted, marginTop: spacing.sm },
  errorText:       { ...type.body, color: colors.danger, textAlign: 'center', marginBottom: spacing.md },
  emptyTitle:      { ...type.h2, color: colors.text, marginTop: spacing.md },
  emptyBody:       { ...type.caption, color: colors.textMuted, marginTop: spacing.xs, marginBottom: spacing.lg },
  retryBtn:        { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingVertical: spacing.sm, paddingHorizontal: spacing.lg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.primary },
  retryText:       { color: colors.primary, fontWeight: '700' },
  card:            { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.md },
  cardHeader:      { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: spacing.sm, flexWrap: 'wrap' },
  statusBadge:     { paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: radius.pill },
  statusText:      { fontSize: 10, fontWeight: '700' },
  typeBadge:       { paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border },
  typeText:        { fontSize: 10, color: colors.textMuted, fontWeight: '600' },
  dateRow:         { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 3 },
  dateText:        { fontSize: 10, color: colors.textMuted },
  roundTripBanner: { backgroundColor: '#FFF8E1', borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 3, marginBottom: spacing.sm },
  roundTripText:   { fontSize: 10, color: '#F57F17', fontWeight: '600' },
  routeBox:        { backgroundColor: colors.background, borderRadius: radius.md, padding: spacing.sm, marginBottom: spacing.sm },
  routeRow:        { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  routeText:       { flex: 1, fontSize: 12, color: colors.text },
  routeDot:        { width: 1, height: 12, backgroundColor: colors.border, marginLeft: 6, marginVertical: 2 },
  metaRow:         { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flexWrap: 'wrap' },
  metaText:        { fontSize: 11, color: colors.textMuted, textTransform: 'capitalize' },
  metaDot:         { fontSize: 11, color: colors.border },
  fareText:        { fontSize: 11, fontWeight: '700', color: colors.primary },
  customerText:    { fontSize: 11, color: colors.textMuted, marginTop: 4 },
  footer:          { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, padding: spacing.lg },
  footerText:      { ...type.caption, color: colors.textMuted },
  loadMoreBtn:     { alignItems: 'center', padding: spacing.lg, marginBottom: spacing.md },
  loadMoreText:    { color: colors.primary, fontWeight: '700' },
  endText:         { ...type.caption, color: colors.textMuted, textAlign: 'center', padding: spacing.lg },
});
