// @ts-nocheck
/**
 * src/screens/RateCustomerScreen.jsx
 *
 * Driver rates the customer after a trip ends. Navigated to automatically on
 * trip completion (from TripScreen), and reachable again from a COMPLETED
 * trip if the driver skipped it.
 *
 * Params: { bookingId, customerName? }
 *
 * On mount it checks whether this trip was already rated; if so it shows the
 * existing rating read-only instead of letting the driver rate twice.
 * Registered as a stack screen "RateCustomer" in MainTabs.jsx.
 */
import { useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
  ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Star, CheckCircle2, User } from 'lucide-react-native';
import { colors, radius, spacing, type } from '../theme';
import { Button } from '../components/Button';
import { StarRating } from '../components/StarRating';
import { reviewsApi } from '../api/reviews';

const STAR_WORDS = ['', 'Poor', 'Fair', 'Good', 'Very good', 'Excellent'];
const MAX_COMMENT = 300;

export function RateCustomerScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const bookingId = route.params?.bookingId;
  const customerName = route.params?.customerName || 'the customer';

  const [checking, setChecking]   = useState(true);
  const [existing, setExisting]   = useState(null);
  const [stars, setStars]         = useState(0);
  const [comment, setComment]     = useState('');
  const [submitting, setSubmit]   = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!bookingId) { setChecking(false); return; }
      try {
        const review = await reviewsApi.getBookingReview(bookingId);
        if (alive) setExisting(review);
      } catch { /* treat as not-yet-rated */ }
      finally { if (alive) setChecking(false); }
    })();
    return () => { alive = false; };
  }, [bookingId]);

  async function submit() {
    if (stars < 1) { Alert.alert('Pick a rating', 'Tap the stars to rate your trip with the customer.'); return; }
    setSubmit(true);
    try {
      await reviewsApi.rateCustomer(bookingId, { stars, comment });
      Alert.alert('Thanks! ✓', 'Your feedback has been recorded.', [
        { text: 'Done', onPress: () => navigation.goBack() },
      ]);
    } catch (err) {
      if (err?.status === 409 || err?.code === 'ALREADY_REVIEWED') {
        Alert.alert('Already rated', 'You have already rated this trip.', [
          { text: 'OK', onPress: () => navigation.goBack() },
        ]);
      } else {
        Alert.alert('Error', err?.message || 'Could not submit. Please try again.');
      }
    } finally {
      setSubmit(false);
    }
  }

  if (checking) {
    return <View style={styles.center}><ActivityIndicator size="large" color={colors.primary} /></View>;
  }

  // Already rated → read-only confirmation.
  if (existing) {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <View style={styles.doneCard}>
          <CheckCircle2 size={40} color={colors.success} />
          <Text style={styles.doneTitle}>You rated this trip</Text>
          <StarRating value={existing.stars} size={26} style={{ marginVertical: spacing.sm }} />
          {existing.comment ? <Text style={styles.doneComment}>“{existing.comment}”</Text> : null}
        </View>
        <Button label="Done" flex={false} style={styles.submitBtn} onPress={() => navigation.goBack()} />
      </ScrollView>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <View style={styles.avatar}><User size={30} color={colors.primaryText} /></View>
          <Text style={styles.title}>Rate {customerName}</Text>
          <Text style={styles.subtitle}>How was your trip with this customer?</Text>
        </View>

        <View style={styles.starCard}>
          <StarRating value={stars} onChange={setStars} size={44} />
          <Text style={styles.starWord}>{STAR_WORDS[stars] || 'Tap to rate'}</Text>
        </View>

        <Text style={styles.fieldLabel}>Add a note (optional)</Text>
        <TextInput
          style={styles.commentInput}
          value={comment}
          onChangeText={(v) => setComment(v.slice(0, MAX_COMMENT))}
          placeholder="Anything dispatch should know — punctuality, behaviour, etc."
          placeholderTextColor={colors.textMuted}
          multiline
          numberOfLines={4}
          textAlignVertical="top"
        />
        <Text style={styles.charCount}>{comment.length}/{MAX_COMMENT}</Text>

        <Button
          label={submitting ? 'Submitting…' : 'Submit Rating'}
          Icon={Star}
          loading={submitting}
          flex={false}
          style={styles.submitBtn}
          onPress={submit}
        />
        <Button
          label="Skip"
          variant="ghost"
          flex={false}
          style={styles.skipBtn}
          onPress={() => navigation.goBack()}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container:     { flex: 1, backgroundColor: colors.background },
  content:       { padding: spacing.lg, paddingBottom: spacing.xl * 2 },
  center:        { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },

  header:        { alignItems: 'center', marginBottom: spacing.lg, gap: spacing.xs },
  avatar:        { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.sm },
  title:         { ...type.h2, color: colors.text },
  subtitle:      { fontSize: 13, color: colors.textMuted, textAlign: 'center' },

  starCard:      { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.xl, alignItems: 'center', marginBottom: spacing.lg, gap: spacing.md },
  starWord:      { fontSize: 15, fontWeight: '700', color: colors.primary, minHeight: 20 },

  fieldLabel:    { ...type.label, color: colors.text, marginBottom: spacing.xs },
  commentInput:  { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface, padding: spacing.md, fontSize: 15, color: colors.text, minHeight: 96 },
  charCount:     { fontSize: 11, color: colors.textMuted, textAlign: 'right', marginTop: 4, marginBottom: spacing.lg },

  submitBtn:     { alignSelf: 'stretch' },
  skipBtn:       { alignSelf: 'stretch', marginTop: spacing.sm },

  doneCard:      { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.xl, alignItems: 'center', marginBottom: spacing.lg, gap: spacing.xs },
  doneTitle:     { ...type.h2, color: colors.text, marginTop: spacing.sm },
  doneComment:   { fontSize: 14, color: colors.textMuted, fontStyle: 'italic', textAlign: 'center', marginTop: spacing.sm },
});
