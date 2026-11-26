// @ts-nocheck
/**
 * DocUploadRow — document upload row with thumbnail, status, and action buttons.
 * Tapping shows an action sheet (camera or gallery) via the useCloudinaryUpload hook.
 * Once uploaded, shows the thumbnail with a green border and re-upload option.
 */
import { Image, Pressable, StyleSheet, Text, View, ActivityIndicator } from 'react-native';
import { Camera, ImageIcon, CheckCircle } from 'lucide-react-native';
import { colors, radius, spacing } from '../theme';

export function DocUploadRow({ label, sublabel = 'Tap to upload', Icon, uploaded, uploading, onPress }) {
  return (
    <Pressable
      style={[styles.row, uploaded && styles.rowUploaded]}
      onPress={onPress}
      disabled={uploading}
    >
      {/* Left: thumbnail or icon placeholder */}
      {uploaded ? (
        <Image source={{ uri: uploaded.url }} style={styles.thumb} />
      ) : (
        <View style={styles.thumbEmpty}>
          {uploading
            ? <ActivityIndicator size="small" color={colors.primary} />
            : Icon
              ? <Icon size={22} color={colors.textMuted} />
              : <Camera size={22} color={colors.textMuted} />
          }
        </View>
      )}

      {/* Middle: label + status */}
      <View style={styles.text}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.status}>
          {uploading
            ? 'Uploading…'
            : uploaded
              ? 'Uploaded — tap to replace'
              : sublabel}
        </Text>
        {!uploaded && !uploading && (
          <View style={styles.optionRow}>
            <View style={styles.optionBadge}>
              <Camera size={11} color={colors.primary} />
              <Text style={styles.optionText}>Camera</Text>
            </View>
            <View style={styles.optionBadge}>
              <ImageIcon size={11} color={colors.primary} />
              <Text style={styles.optionText}>Gallery</Text>
            </View>
          </View>
        )}
      </View>

      {/* Right: status icon */}
      {uploaded
        ? <CheckCircle size={20} color={colors.success} />
        : uploading
          ? null
          : <Camera size={20} color={colors.textMuted} />
      }
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    marginBottom: spacing.md, backgroundColor: colors.surface,
    borderRadius: radius.lg, padding: spacing.md,
    borderWidth: 1, borderColor: colors.border,
  },
  rowUploaded: { borderColor: colors.success },
  thumb: { width: 56, height: 56, borderRadius: radius.md },
  thumbEmpty: {
    width: 56, height: 56, borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center', justifyContent: 'center',
  },
  text: { flex: 1 },
  label:  { fontSize: 14, fontWeight: '700', color: colors.text },
  status: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  optionRow: { flexDirection: 'row', gap: spacing.sm, marginTop: 6 },
  optionBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: colors.surfaceAlt, borderRadius: radius.pill,
    paddingHorizontal: 8, paddingVertical: 3,
    borderWidth: 1, borderColor: colors.border,
  },
  optionText: { fontSize: 11, color: colors.primary, fontWeight: '600' },
});
