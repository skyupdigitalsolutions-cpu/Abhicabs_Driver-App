// @ts-nocheck
/**
 * src/screens/NotificationsScreen.jsx
 *
 * NEW FILE — was missing from the project entirely, causing a runtime crash
 * whenever the bell icon in MainTabs was tapped (import error).
 *
 * The backend has no /admin/notifications endpoint, so this screen reads
 * from the Redux notifications store (mock data, maintained in-memory).
 * When a real notifications endpoint is added to the backend, replace the
 * Redux reads with an API call here.
 */
import { useCallback } from 'react';
import {
  FlatList, Pressable, RefreshControl, StyleSheet, Text, View, ActivityIndicator,
} from 'react-native';
import { useDispatch, useSelector } from 'react-redux';
import { Bell, CheckCheck, AlertCircle, Info, CheckCircle } from 'lucide-react-native';
import { colors, spacing, type } from '../theme';
import { markRead, markAllRead } from '../store/notificationsSlice';

const KIND_ICON = {
  TRIP:    { Icon: CheckCircle,  color: '#2E7D32' },
  PAYMENT: { Icon: Info,         color: colors.primary },
  ALERT:   { Icon: AlertCircle,  color: colors.danger  },
  INFO:    { Icon: Info,         color: colors.textMuted },
};

function NotificationRow({ item, onMarkRead }) {
  const kind = KIND_ICON[item.type] ?? KIND_ICON.INFO;
  const { Icon, color } = kind;

  return (
    <Pressable
      style={[styles.row, !item.read && styles.rowUnread]}
      onPress={() => !item.read && onMarkRead(item.id)}
    >
      <View style={[styles.iconWrap, { backgroundColor: color + '18' }]}>
        <Icon size={18} color={color} />
      </View>
      <View style={styles.rowBody}>
        <Text style={[styles.rowTitle, !item.read && styles.rowTitleUnread]}>
          {item.title ?? 'Notification'}
        </Text>
        {item.body ? (
          <Text style={styles.rowBody2} numberOfLines={2}>{item.body}</Text>
        ) : null}
        {item.createdAt ? (
          <Text style={styles.rowTime}>{formatTime(item.createdAt)}</Text>
        ) : null}
      </View>
      {!item.read && <View style={styles.unreadDot} />}
    </Pressable>
  );
}

function formatTime(iso) {
  try {
    const d = new Date(iso);
    const diffMs = Date.now() - d.getTime();
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1)  return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24)  return `${hrs}h ago`;
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  } catch {
    return '';
  }
}

export function NotificationsScreen() {
  const dispatch = useDispatch();
  const { items = [], unreadCount = 0, status = 'idle' } = useSelector((s) => s.notifications);

  const onMarkRead = useCallback((id) => {
    dispatch(markRead(id));
  }, [dispatch]);

  const onMarkAllRead = useCallback(() => {
    dispatch(markAllRead());
  }, [dispatch]);

  const isLoading = status === 'loading';

  if (isLoading && items.length === 0) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (items.length === 0) {
    return (
      <View style={styles.center}>
        <Bell size={48} color={colors.border} />
        <Text style={styles.emptyTitle}>No notifications</Text>
        <Text style={styles.emptyBody}>You're all caught up.</Text>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      {unreadCount > 0 && (
        <Pressable style={styles.markAllRow} onPress={onMarkAllRead}>
          <CheckCheck size={14} color={colors.primary} />
          <Text style={styles.markAllText}>Mark all as read</Text>
        </Pressable>
      )}
      <FlatList
        data={items}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={isLoading}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
        renderItem={({ item }) => (
          <NotificationRow item={item} onMarkRead={onMarkRead} />
        )}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root:           { flex: 1, backgroundColor: colors.background },
  center:         { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, backgroundColor: colors.background },
  emptyTitle:     { ...type.h2, color: colors.text },
  emptyBody:      { ...type.caption, color: colors.textMuted },
  markAllRow:     { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  markAllText:    { ...type.label, color: colors.primary },
  list:           { paddingBottom: spacing.xl },
  row:            { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  rowUnread:      { backgroundColor: colors.surfaceAlt },
  iconWrap:       { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginTop: 2, flexShrink: 0 },
  rowBody:        { flex: 1, gap: 3 },
  rowTitle:       { ...type.body, color: colors.text },
  rowTitleUnread: { fontWeight: '700' },
  rowBody2:       { ...type.caption, color: colors.textMuted },
  rowTime:        { ...type.caption, color: colors.textMuted },
  unreadDot:      { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary, marginTop: 6, flexShrink: 0 },
  separator:      { height: 1, backgroundColor: colors.border },
});
