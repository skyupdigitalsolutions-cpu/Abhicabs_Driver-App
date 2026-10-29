// @ts-nocheck
/**
 * src/screens/VehicleDocumentsScreen.jsx  [NEW]
 *
 * Step 3 of onboarding — upload RC, INSURANCE, PUC for the driver's vehicle.
 * Without these, POST /driver/me/submit returns 422 DOCUMENTS_INCOMPLETE.
 *
 * vehicleId comes from onboarding.vehicles[0].vehicle.id (the vehicle just
 * registered in step 2). This screen reads it from the session rather than
 * from navigation params so it stays correct across restarts.
 *
 * Onboarding flow: Register → RegisterVehicle → VehicleDocuments (this)
 *                  → DocumentUpload (driver KYC docs) → Submit
 *
 * API: POST /driver/me/vehicles/:vehicleId/documents (multipart)
 *   body: file + docType ∈ { RC, INSURANCE, PUC }
 *   response: { vehicle, onboarding }
 */
import { useState } from 'react';
import {
  Alert, Image, Pressable, ScrollView, StyleSheet, Text, View, ActivityIndicator,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { promptForImage } from '../lib/imagePicker';
import { FileText, Camera, CheckCircle, Upload, ChevronRight, Shield } from 'lucide-react-native';
import { colors, spacing, radius } from '../theme';
import { Button } from '../components/Button';
import { Card }   from '../components/Card';
import { vehicleDocsApi } from '../api/endpoints';
import { useSession } from '../store/session';

// RC and INSURANCE and PUC are the mandatory vehicle docs (Document C §4)
const VEHICLE_DOCS = [
  {
    key:         'RC',
    label:       'Registration Certificate (RC)',
    description: 'Vehicle registration certificate (front)',
    icon:        FileText,
    required:    true,
  },
  {
    key:         'INSURANCE',
    label:       'Insurance Policy',
    description: 'Valid vehicle insurance document',
    icon:        Shield,
    required:    true,
  },
  {
    key:         'PUC',
    label:       'PUC Certificate',
    description: 'Pollution Under Control certificate',
    icon:        FileText,
    required:    true,
  },
];

export function VehicleDocumentsScreen() {
  const { refresh, onboarding, driverStatus } = useSession();
  const navigation = useNavigation();
  const route = useRoute();
  const inOnboarding = driverStatus !== 'approved';

  // Which vehicle? An explicit id (Profile → a specific vehicle) wins; then a
  // registration-number match; then the first vehicle (onboarding). It used
  // to ALWAYS be vehicles[0] — so the documents for a second vehicle were
  // uploaded against the first one.
  const vehicles = onboarding?.vehicles ?? [];
  const vOf = (v) => v?.vehicle ?? v;
  const paramId = route.params?.vehicleId ?? null;
  const paramReg = route.params?.registrationNumber ?? null;
  const byReg = paramReg ? vehicles.find((v) => vOf(v)?.registrationNumber === paramReg) : null;
  const vehicleId = paramId ?? vOf(byReg)?.id ?? (paramReg ? null : vOf(vehicles[0])?.id) ?? null;

  // Documents the server already has (e.g. app was closed half-way through)
  // count as done — previously the driver had to upload all three again.
  // The onboarding "missing" list describes the onboarding vehicle only.
  const serverMissing = !paramId && !paramReg
    ? (onboarding?.steps?.vehicleDocs?.missing ?? onboarding?.missingVehicleDocs ?? null)
    : null;
  const serverHas = (key) => Array.isArray(serverMissing) && !serverMissing.includes(key);

  const [uploads,    setUploads]    = useState({});
  const [submitting, setSubmitting] = useState(false);
  const statusOf = (key) => uploads[key]?.status ?? (serverHas(key) ? 'done' : undefined);
  const allRequired = VEHICLE_DOCS.filter((d) => d.required).every((d) => statusOf(d.key) === 'done');

  function pickAndUpload(docType) {
    if (!vehicleId) {
      Alert.alert('No vehicle found', 'Please register a vehicle first.');
      return;
    }
    promptForImage({
      title: 'Upload document',
      message: 'Choose how to add this document',
      onPicked: (uri) => doUpload(docType, uri),
    });
  }

  async function doUpload(docType, uri) {
    if (!vehicleId) {
      Alert.alert('Error', 'No vehicle found. Please register a vehicle first.');
      return;
    }

    setUploads((prev) => ({ ...prev, [docType]: { uri, status: 'uploading' } }));
    try {
      await vehicleDocsApi.upload(vehicleId, uri, docType);
      setUploads((prev) => ({ ...prev, [docType]: { uri, status: 'done' } }));
    } catch (err) {
      setUploads((prev) => ({ ...prev, [docType]: { uri, status: 'error' } }));
      Alert.alert('Upload failed', err.message || 'Please try again.');
    }
  }

  async function handleContinue() {
    if (!allRequired) {
      Alert.alert('Required documents missing', 'Please upload RC, Insurance, and PUC before continuing.');
      return;
    }
    setSubmitting(true);
    try {
      // Onboarding: refresh → Root recomputes the step and moves on.
      await refresh();
    } catch {
      /* best-effort; routing catches up on the next refresh */
    } finally {
      setSubmitting(false);
    }
    // Main app (opened from Profile): nothing re-routes automatically.
    if (!inOnboarding && navigation.canGoBack()) navigation.goBack();
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Step indicator (onboarding only) */}
      {inOnboarding && (<>
      <View style={styles.stepRow}>
        <View style={[styles.stepDot, styles.stepDone]}><Text style={styles.stepNum}>✓</Text></View>
        <View style={[styles.stepLine, styles.stepLineDone]} />
        <View style={[styles.stepDot, styles.stepDone]}><Text style={styles.stepNum}>✓</Text></View>
        <View style={[styles.stepLine, styles.stepLineDone]} />
        <View style={[styles.stepDot, styles.stepActive]}><Text style={styles.stepNum}>3</Text></View>
        <View style={styles.stepLine} />
        <View style={styles.stepDot}><Text style={[styles.stepNum, { color: colors.textMuted }]}>4</Text></View>
      </View>

      <View style={styles.stepLabels}>
        <Text style={styles.stepLabel}>Personal ✓</Text>
        <Text style={styles.stepLabel}>Vehicle ✓</Text>
        <Text style={[styles.stepLabel, styles.stepLabelActive]}>Veh. Docs</Text>
        <Text style={styles.stepLabel}>Driver Docs</Text>
      </View>
      </>)}
      {!!paramReg && <Text style={styles.docDesc}>Vehicle {paramReg}</Text>}

      <Text style={styles.title}>Vehicle Documents</Text>
      <Text style={styles.hint}>
        Upload RC, insurance, and PUC certificate for your vehicle. All three are required
        to submit your application.
      </Text>

      {!vehicleId && (
        <View style={styles.warnBox}>
          <Text style={styles.warnText}>
            {paramReg
              ? `Vehicle ${paramReg} is still being set up. Go back to Profile and try again in a moment.`
              : 'No vehicle found. Register your vehicle first.'}
          </Text>
        </View>
      )}

      {/* Document rows */}
      {VEHICLE_DOCS.map((doc) => {
        const upload = { ...uploads[doc.key], status: statusOf(doc.key) };
        const Icon   = doc.icon;

        return (
          <Card key={doc.key} style={styles.docCard}>
            <View style={styles.docHeader}>
              <Icon size={20} color={upload?.status === 'done' ? colors.success : colors.primary} />
              <View style={styles.docInfo}>
                <Text style={styles.docLabel}>
                  {doc.label}{doc.required ? ' *' : ''}
                </Text>
                <Text style={styles.docDesc}>{doc.description}</Text>
              </View>
              {upload?.status === 'done' && (
                <CheckCircle size={20} color={colors.success} />
              )}
            </View>

            {/* Preview */}
            {!!upload?.uri && (
              <Image source={{ uri: upload.uri }} style={styles.docPreview} />
            )}

            {/* Upload / retry button */}
            <Pressable
              style={[
                styles.uploadBtn,
                upload?.status === 'done' && styles.uploadBtnDone,
                upload?.status === 'error' && styles.uploadBtnError,
              ]}
              onPress={() => pickAndUpload(doc.key)}
              disabled={upload?.status === 'uploading'}
            >
              {upload?.status === 'uploading' ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <>
                  <Camera size={16} color={
                    upload?.status === 'done'  ? colors.success :
                    upload?.status === 'error' ? colors.danger  : colors.primary
                  } />
                  <Text style={[
                    styles.uploadBtnText,
                    upload?.status === 'done'  && styles.uploadBtnTextDone,
                    upload?.status === 'error' && styles.uploadBtnTextError,
                  ]}>
                    {upload?.status === 'done'  ? '✓ Uploaded — tap to replace' :
                     upload?.status === 'error' ? 'Upload failed — retry' :
                     upload?.uri               ? 'Re-upload' : 'Upload document'}
                  </Text>
                </>
              )}
            </Pressable>
          </Card>
        );
      })}

      <Button
        label={submitting ? 'Saving…' : inOnboarding ? 'Continue to Driver Documents' : 'Done'}
        Icon={allRequired ? CheckCircle : Upload}
        IconRight={ChevronRight}
        loading={submitting}
        flex={false}
        style={styles.continueBtn}
        onPress={handleContinue}
        disabled={!allRequired}
      />

      {!allRequired && (
        <Text style={styles.missingText}>
          Upload all three required documents (*) to continue.
        </Text>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container:        { flex: 1, backgroundColor: colors.background },
  content:          { padding: spacing.lg, paddingBottom: spacing.xl * 2 },
  stepRow:          { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.xs },
  stepDot:          { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  stepActive:       { backgroundColor: colors.primary, borderColor: colors.primary },
  stepDone:         { backgroundColor: colors.success, borderColor: colors.success },
  stepNum:          { fontSize: 11, fontWeight: '700', color: '#fff' },
  stepLine:         { flex: 1, height: 2, backgroundColor: colors.border, marginHorizontal: 4 },
  stepLineDone:     { backgroundColor: colors.success },
  stepLabels:       { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.xl },
  stepLabel:        { fontSize: 10, color: colors.textMuted, fontWeight: '600', flex: 1, textAlign: 'center' },
  stepLabelActive:  { color: colors.primary },
  title:            { fontSize: 22, fontWeight: '800', color: colors.text, marginBottom: spacing.xs },
  hint:             { fontSize: 13, color: colors.textMuted, marginBottom: spacing.lg, lineHeight: 20 },
  warnBox:          { backgroundColor: '#FFEBEE', borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.md, borderWidth: 1, borderColor: '#FFCDD2' },
  warnText:         { fontSize: 13, color: colors.danger },
  docCard:          { marginBottom: spacing.md },
  docHeader:        { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, marginBottom: spacing.sm },
  docInfo:          { flex: 1 },
  docLabel:         { fontSize: 14, fontWeight: '700', color: colors.text },
  docDesc:          { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  docPreview:       { width: '100%', height: 120, borderRadius: radius.md, resizeMode: 'cover', marginBottom: spacing.sm },
  uploadBtn:        { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderWidth: 1, borderColor: colors.primary, borderRadius: radius.md, padding: spacing.md, backgroundColor: '#EEF6FF', borderStyle: 'dashed' },
  uploadBtnDone:    { borderColor: colors.success, backgroundColor: '#F1F8F1', borderStyle: 'solid' },
  uploadBtnError:   { borderColor: colors.danger, backgroundColor: '#FFEBEE', borderStyle: 'solid' },
  uploadBtnText:    { flex: 1, fontSize: 13, fontWeight: '600', color: colors.primary },
  uploadBtnTextDone:{ color: colors.success },
  uploadBtnTextError:{ color: colors.danger },
  continueBtn:      { alignSelf: 'stretch', marginTop: spacing.lg },
  missingText:      { fontSize: 12, color: colors.textMuted, textAlign: 'center', marginTop: spacing.sm },
});
