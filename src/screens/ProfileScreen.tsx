// @ts-nocheck
import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { User, Phone, CreditCard, Star, Shield, LogOut, Car, Plus, Hash, Wrench, Users, FileText, ChevronRight, Trash2 } from 'lucide-react-native';
import { colors, radius, spacing } from '../theme';
import { InfoRow } from '../components/InfoRow';
import { Button }  from '../components/Button';
import { vehicleApi } from '../api/endpoints';
import { useSession, logout, deleteAccount } from '../store/session';
import { api } from '../api/client';

export function ProfileScreen() {
  const navigation = useNavigation();
  const { user, onboarding } = useSession();
  const [profile,  setProfile]  = useState(null);
  const [vehicles, setVehicles] = useState([]);
  const [status,   setStatus]   = useState('loading');
  const [deleting, setDeleting] = useState(false);

  function confirmDeleteAccount() {
    Alert.alert(
      'Delete Account',
      'This will permanently delete your driver account and cannot be undone. Are you sure you want to continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              await deleteAccount();
              // On success, session.ts's clearSessionLocally() already flips
              // status to 'unauthenticated' — App.tsx's Root() reacts to
              // that and swaps to the Auth stack on its own, no navigation
              // call needed here.
            } catch (err) {
              setDeleting(false);
              Alert.alert(
                'Couldn\u2019t delete account',
                err?.message || 'Something went wrong. Please try again.',
              );
            }
          },
        },
      ],
    );
  }

  // Reload whenever Profile is shown — it used to load once, so a vehicle
  // added from here never appeared until the app was restarted.
  useFocusEffect(useCallback(() => { loadData(); }, [user?.id]));

  // FIX: GET /driver/me returns { driver, onboarding } (confirmed against
  // the backend controller: `res.json({ success: true, data })` where
  // `data = { driver, onboarding }`). This was reading fields straight off
  // the top-level response — profile.licenceNumber, profile.kycStatus,
  // profile.ratingAvg — none of which exist there; they're all nested one
  // level down under `.driver`. Every one of those silently fell through to
  // "Not set" / "No ratings yet" / etc. regardless of the driver's real
  // data, because the field being read was always undefined.
  async function loadData() {
    if (!profile) setStatus('loading');
    let profileData = null;
    try {
      const res = await api.get('/driver/me');
      profileData = res?.driver ?? res; // unwrap the real shape, but tolerate a flatter one too
    } catch {
      try {
        const me = await api.get('/auth/me');
        profileData = { user: me.user || me, licenceNumber: 'Not set', kycStatus: 'PENDING', ratingAvg: null, ratingCount: 0 };
      } catch {
        if (user) profileData = { user, licenceNumber: 'Not set', kycStatus: 'PENDING', ratingAvg: null, ratingCount: 0 };
      }
    }
    let vehicleData = [];
    try { vehicleData = await vehicleApi.getMyVehicles(); } catch { vehicleData = []; }
    setProfile(profileData);
    setVehicles(vehicleData);
    setStatus('ready');
  }

  const displayName  = profile?.user?.name  ?? user?.name  ?? 'Driver';
  const displayEmail = profile?.user?.email ?? user?.email ?? '';
  const displayPhone = profile?.user?.phone ?? user?.phone ?? '--';

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.avatarCard}>
        <View style={styles.avatar}><User size={36} color={colors.primaryText} /></View>
        <Text style={styles.name}>{displayName}</Text>
        <Text style={styles.email}>{displayEmail}</Text>
      </View>

      {status === 'ready' && profile && (
        <View style={styles.infoCard}>
          <InfoRow Icon={Phone}      label="Phone"          value={displayPhone} />
          <InfoRow Icon={CreditCard} label="Licence Number" value={profile?.licenceNumber ?? '--'} />
          <InfoRow Icon={Shield}     label="KYC Status"     value={profile?.kycStatus ?? '--'} />
          <Pressable onPress={() => navigation.navigate('MyReviews')} style={styles.ratingRow}>
            <Star size={16} color={colors.primary} />
            <Text style={styles.ratingLabel}>Rating</Text>
            <Text style={styles.ratingValue}>
              {profile?.ratingAvg ? `${Number(profile.ratingAvg).toFixed(1)} (${profile.ratingCount})` : 'No ratings yet'}
            </Text>
            <ChevronRight size={16} color={colors.textMuted} />
          </Pressable>
        </View>
      )}
      {status === 'loading' && <Text style={styles.loadingText}>Loading profile info...</Text>}

      <Button
        label="My Reviews & Ratings"
        variant="secondary"
        Icon={Star}
        IconRight={ChevronRight}
        flex={false}
        style={styles.reviewsBtn}
        onPress={() => navigation.navigate('MyReviews')}
      />

      <View style={styles.sectionHeader}>
        <Car size={18} color={colors.primary} />
        <Text style={styles.sectionTitle}>My Vehicles</Text>
      </View>

      {vehicles.length === 0 ? (
        <View style={styles.noVehicleCard}>
          {onboarding?.vehicleFeatureAvailable === false ? (
            <>
              <Text style={styles.noVehicleTitle}>Vehicle registration unavailable</Text>
              <Text style={styles.noVehicleBody}>
                This feature is temporarily unavailable. You can still use the app and complete your
                driver application without a vehicle — check back here once it's restored.
              </Text>
            </>
          ) : (
            <>
              <Text style={styles.noVehicleTitle}>No vehicle registered</Text>
              <Text style={styles.noVehicleBody}>Add your vehicle to start accepting trips. You will need:</Text>
              <View style={styles.requirementList}>
                <View style={styles.reqRow}><Hash     size={14} color={colors.primary} /><Text style={styles.reqText}>Registration number (e.g. KA01AB1234)</Text></View>
                <View style={styles.reqRow}><Wrench   size={14} color={colors.primary} /><Text style={styles.reqText}>Make and model (e.g. Maruti Swift Dzire)</Text></View>
                <View style={styles.reqRow}><Car      size={14} color={colors.primary} /><Text style={styles.reqText}>Vehicle type (Sedan / SUV / Tempo Traveller)</Text></View>
                <View style={styles.reqRow}><Users    size={14} color={colors.primary} /><Text style={styles.reqText}>Seating capacity</Text></View>
                <View style={styles.reqRow}><FileText size={14} color={colors.primary} /><Text style={styles.reqText}>Photos of RC, Insurance and PUC certificate</Text></View>
              </View>
              <Button label="Register Vehicle" Icon={Plus} flex={false} style={styles.registerBtn} onPress={() => navigation.navigate('RegisterVehicle')} />
            </>
          )}
        </View>
      ) : (
        vehicles.map((link, i) => {
          // Items may be the vehicle itself or a { status, vehicle } link row.
          const v = link?.vehicle ?? link;
          const vehicleId = v?.id ?? link?.vehicleId;
          const vStatus = link?.status ?? v?.status;
          const details = [v?.makeModel, v?.vehicleClass, v?.seatingCapacity ? `${v.seatingCapacity} seats` : null].filter(Boolean).join(' · ');
          return (
            <View key={vehicleId ?? i} style={styles.vehicleCard}>
              <View style={styles.vehicleHeader}>
                <Car size={16} color={colors.primary} />
                <Text style={styles.vehicleReg}>{v?.registrationNumber || '—'}</Text>
                {!!vStatus && <Text style={styles.vehicleStatus}>{String(vStatus).replace(/_/g, ' ')}</Text>}
              </View>
              {!!details && <Text style={styles.vehicleDetail}>{details}</Text>}
              {!!(vehicleId || v?.registrationNumber) && (
                <Pressable
                  style={styles.vehicleDocsLink}
                  onPress={() => navigation.navigate('VehicleDocuments', { vehicleId, registrationNumber: v?.registrationNumber })}
                >
                  <FileText size={14} color={colors.primary} />
                  <Text style={styles.vehicleDocsText}>Upload / replace documents</Text>
                  <ChevronRight size={14} color={colors.textMuted} />
                </Pressable>
              )}
            </View>
          );
        })
      )}

      {vehicles.length > 0 && onboarding?.vehicleFeatureAvailable !== false && (
        <Button label="Add Another Vehicle" variant="secondary" Icon={Plus} flex={false} style={styles.addMoreBtn} onPress={() => navigation.navigate('RegisterVehicle')} />
      )}

      <Button
        label="Log Out"
        variant="danger"
        Icon={LogOut}
        flex={false}
        style={styles.logoutBtn}
        onPress={() => Alert.alert('Log out?', 'You will stop receiving trips until you log in again.', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Log Out', style: 'destructive', onPress: logout },
        ])}
      />

      <Button
        label={deleting ? 'Deleting...' : 'Delete Account'}
        variant="danger"
        Icon={Trash2}
        flex={false}
        disabled={deleting}
        style={styles.deleteBtn}
        onPress={confirmDeleteAccount}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container:       { flex: 1, backgroundColor: colors.background },
  content:         { padding: spacing.lg, paddingBottom: spacing.xl * 2 },
  avatarCard:      { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, alignItems: 'center', borderWidth: 1, borderColor: colors.border, marginBottom: spacing.md },
  avatar:          { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.sm },
  name:            { fontSize: 20, fontWeight: '700', color: colors.text },
  email:           { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  infoCard:        { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.md, overflow: 'hidden' },
  ratingRow:       { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.md, paddingHorizontal: spacing.lg },
  ratingLabel:     { flex: 1, color: colors.textMuted, fontSize: 13 },
  ratingValue:     { color: colors.text, fontWeight: '700', fontSize: 13 },
  reviewsBtn:      { alignSelf: 'stretch', marginBottom: spacing.lg },
  loadingText:     { fontSize: 12, color: colors.textMuted, textAlign: 'center', marginBottom: spacing.lg },
  sectionHeader:   { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  sectionTitle:    { fontSize: 17, fontWeight: '700', color: colors.text },
  noVehicleCard:   { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.md },
  noVehicleTitle:  { fontSize: 14, fontWeight: '700', color: colors.text, marginBottom: spacing.xs },
  noVehicleBody:   { fontSize: 12, color: colors.textMuted, marginBottom: spacing.md },
  requirementList: { gap: spacing.sm, marginBottom: spacing.lg },
  reqRow:          { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  reqText:         { fontSize: 13, color: colors.text, flex: 1 },
  registerBtn:     { alignSelf: 'stretch' },
  vehicleCard:     { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.sm },
  vehicleHeader:   { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: 4 },
  vehicleReg:      { fontSize: 14, fontWeight: '700', color: colors.text, flex: 1 },
  vehicleDetail:   { fontSize: 13, color: colors.textMuted },
  vehicleStatus:   { fontSize: 11, fontWeight: '700', color: colors.textMuted },
  vehicleDocsLink: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.sm },
  vehicleDocsText: { flex: 1, fontSize: 13, fontWeight: '600', color: colors.primary },
  addMoreBtn:      { alignSelf: 'stretch', marginBottom: spacing.md },
  logoutBtn:       { alignSelf: 'stretch', marginTop: spacing.md },
  deleteBtn:       { alignSelf: 'stretch', marginTop: spacing.sm, opacity: 0.85 },
});
