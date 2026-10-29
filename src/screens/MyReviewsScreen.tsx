// @ts-nocheck
/**
 * src/screens/MyReviewsScreen.jsx
 *
 * "My Reviews & Ratings" — the driver's own rating summary plus every
 * customer→driver review they've received, newest first, with pull-to-refresh
 * and infinite scroll.
 *
 * Reached from ProfileScreen (tap the Rating row, or the button under it).
 * Registered as a stack screen "MyReviews" in MainTabs.jsx.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, View,
} from 'react-native';
import { Star, MessageSquare } from 'lucide-react-native';
import { colors, radius, spacing, type } from '../theme';
import { StarRating } from '../components/StarRating';
import { reviewsApi } from '../api/reviews';

const PAGE_SIZE = 20;

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function ReviewCard({ item }) {
  const name = item?.customer?.name || 'Customer';
  const ref = item?.booking?.ref || item?.booking?.id;
  return (
    <View style={styles.reviewCard}>
      <View style={styles.reviewHeader}>
        <StarRating value={item.stars} size={16} />
        <Text style={styles.reviewDate}>{formatDate(item.createdAt)}</Text>
      </View>
      {item.comment ? (
        <Text style={styles.reviewComment}>{item.comment}</Text>
      ) : (
        <Text style={styles.reviewCommentMuted}>No written feedback</Text>
      )}
      <Text style={styles.reviewMeta}>
        {name}{ref ? ` · Trip #${String(ref).slice(-6)}` : ''}
      </Text>
    </View>
  );
}

export function MyReviewsScreen() {
  const [items, setItems]       = useState([]);
  const [summary, setSummary]   = useState({ ratingAvg: null, ratingCount: 0 });
  const [page, setPage]         = useState(1);
  const [totalPages, setTotal]  = useState(1);
  const [status, setStatus]     = useState('loading'); // loading | ready | error
  const [refreshing, setRefresh] = useState(false);
  const [loadingMore, setMore]  = useState(false);

  const load = useCallback(async (targetPage = 1, mode = 'replace') => {
    try {
      const res = await reviewsApi.myReviews(targetPage, PAGE_SIZE);
      setSummary(res.summary);
      setTotal(res.pagination?.totalPages ?? 1);
      setPage(targetPage);
      setItems((prev) => (mode === 'append' ? [...prev, ...res.items] : res.items));
      setStatus('ready');
    } catch {
      setStatus('error');
    }
  }, []);

  useEffect(() => { load(1, 'replace'); }, [load]);

  const onRefresh = useCallback(async () => {
    setRefresh(true);
    await load(1, 'replace');
    setRefresh(false);
  }, [load]);

  const onEndReached = useCallback(async () => {
    if (loadingMore || page >= totalPages) return;
    setMore(true);
    await load(page + 1, 'append');
    setMore(false);
  }, [loadingMore, page, totalPages, load]);

  if (status === 'loading') {
    return <View style={styles.center}><ActivityIndicator size="large" color={colors.primary} /></View>;
  }

  const avg = summary.ratingAvg != null ? Number(summary.ratingAvg) : null;

  return (
    <FlatList
      style={styles.container}
      contentContainerStyle={styles.content}
      data={items}
      keyExtractor={(it, i) => String(it.id ?? i)}
      renderItem={({ item }) => <ReviewCard item={item} />}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      onEndReached={onEndReached}
      onEndReachedThreshold={0.4}
      ListHeaderComponent={
        <View style={styles.summaryCard}>
          <Text style={styles.summaryNumber}>{avg != null ? avg.toFixed(1) : '—'}</Text>
          <StarRating value={avg ?? 0} size={22} />
          <Text style={styles.summarySub}>
            {summary.ratingCount > 0
              ? `Based on ${summary.ratingCount} customer review${summary.ratingCount === 1 ? '' : 's'}`
              : 'No customer reviews yet'}
          </Text>
        </View>
      }
      ListEmptyComponent={
        status === 'error' ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyText}>Couldn't load your reviews.</Text>
            <Text style={styles.emptySub}>Pull down to try again.</Text>
          </View>
        ) : (
          <View style={styles.emptyBox}>
            <MessageSquare size={30} color={colors.textMuted} />
            <Text style={styles.emptyText}>No reviews yet</Text>
            <Text style={styles.emptySub}>
              Ratings from customers will appear here after your trips.
            </Text>
          </View>
        )
      }
      ListFooterComponent={
        loadingMore ? <ActivityIndicator style={{ marginVertical: spacing.lg }} color={colors.primary} /> : null
      }
    />
  );
}

const styles = StyleSheet.create({
  container:     { flex: 1, backgroundColor: colors.background },
  content:       { padding: spacing.lg, paddingBottom: spacing.xl * 2, flexGrow: 1 },
  center:        { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },

  summaryCard:   { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.xl, alignItems: 'center', marginBottom: spacing.lg, gap: spacing.sm },
  summaryNumber: { fontSize: 44, fontWeight: '800', color: colors.text, lineHeight: 48 },
  summarySub:    { fontSize: 13, color: colors.textMuted, marginTop: spacing.xs },

  reviewCard:    { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: spacing.sm },
  reviewHeader:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
  reviewDate:    { fontSize: 12, color: colors.textMuted },
  reviewComment: { fontSize: 14, color: colors.text, lineHeight: 20 },
  reviewCommentMuted: { fontSize: 13, color: colors.textMuted, fontStyle: 'italic' },
  reviewMeta:    { fontSize: 12, color: colors.textMuted, marginTop: spacing.sm },

  emptyBox:      { alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.xl * 2, gap: spacing.sm, flex: 1 },
  emptyText:     { ...type.h2, color: colors.text },
  emptySub:      { fontSize: 13, color: colors.textMuted, textAlign: 'center', paddingHorizontal: spacing.lg },
});
