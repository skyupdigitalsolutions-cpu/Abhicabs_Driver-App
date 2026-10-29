// @ts-nocheck
/**
 * src/screens/DocumentUploadScreen.jsx
 *
 * Step 4 of onboarding — Upload driver KYC documents + submit application.
 *
 * CHANGE: Submit button is gated on BOTH:
 *   • All 3 driver docs uploaded (LICENCE, AADHAAR, PHOTO)
 *   • onboarding.missingVehicleDocs.length === 0 (RC, INSURANCE, PUC already done)
 * Without this, the submit hits 422 DOCUMENTS_INCOMPLETE because vehicle docs
 * are missing, even if driver docs are complete (Document A #14).
 *
 * API calls:
 *   POST /driver/me/documents  — multipart file upload per doc
 *   POST /driver/me/submit     — submit for admin KYC review
 */
import { useState } from 'react';
import {
  Alert, Image, Pressable, ScrollView, StyleSheet, Text, View, ActivityIndicator,
} from 'react-native';
import { promptForImage } from '../lib/imagePicker';
import {
  FileText, Camera, CheckCircle, Upload, ChevronRight, AlertCircle, AlertTriangle,
} from 'lucide-react-native';
import { colors, spacing, radius } from '../theme';
import { Button } from '../components/Button';
import { Card }   from '../components/Card';
import { documentsApi, driverApplicationApi } from '../api/endpoints';
import { useSession, initSession } from '../store/session';

const DOCS = [
  {
    key:         'LICENCE',
    label:       'Driving Licence',
    description: 'Front side of your valid driving licence',
    icon:        FileText,
  },
  {
    key:         'AADHAAR',
    label:       'Aadhaar Card',
    description: 'Front side of your Aadhaar card',
    icon:        FileText,
  },
  {
    key:         'PHOTO',
    label:       'Your Photo',
    description: 'Clear selfie or recent passport-size photo',
    icon:        Camera,
  },
];

/**
 * The vehicle steps are only "done" if a vehicle was actually registered.
 * A driver who chose "I'll add my vehicle later" skipped them, so showing
 * green ticks there claimed they'd completed work they never did — render
 * those two as skipped (grey dash) instead.
 */
function StepIndicator({ hasVehicle }) {
  const vehicleDot = hasVehicle
    ? [styles.stepDot, styles.stepDone]
    : [styles.stepDot, styles.stepSkipped];
  const vehicleMark = hasVehicle ? '✓' : '–';
  const vehicleNumStyle = hasVehicle ? styles.stepNum : styles.stepNumSkipped;
  const vehicleLine = hasVehicle
    ? [styles.stepLine, styles.stepLineDone]
    : [styles.stepLine];

  return (
    <View style={styles.stepRow}>
      <View style={[styles.stepDot, styles.stepDone]}><Text style={styles.stepNum}>✓</Text></View>
      <View style={[styles.stepLine, styles.stepLineDone]} />
      <View style={vehicleDot}><Text style={vehicleNumStyle}>{vehicleMark}</Text></View>
      <View style={vehicleLine} />
      <View style={vehicleDot}><Text style={vehicleNumStyle}>{vehicleMark}</Text></View>
      <View style={vehicleLine} />
      <View style={[styles.stepDot, styles.stepActive]}><Text style={styles.stepNum}>4</Text></View>
    </View>
  );
}

export function DocumentUploadScreen() {
  const { onboarding } = useSession();
  const [uploads,    setUploads]    = useState({});
  const [submitting, setSubmitting] = useState(false);

  // Documents the server already has count as uploaded. Before, a driver who
  // closed the app after uploading had to upload everything again (and the
  // button stayed disabled until they did).
  const serverMissing = Array.isArray(onboarding?.missingDriverDocs) ? onboarding.missingDriverDocs : null;
  const statusOf = (key) => uploads[key]?.status ?? (serverMissing && !serverMissing.includes(key) ? 'done' : undefined);
  const allDriverDocsUploaded = DOCS.every((d) => statusOf(d.key) === 'done');

  // A vehicle is OPTIONAL at registration (see RegisterVehicleScreen's
  // "I'll add my vehicle later"), and vehicle documents belong to a vehicle.
  // So they can only be required when one actually exists — otherwise a
  // driver who skipped the vehicle step would have three permanently
  // "missing" vehicle docs with nothing to attach them to, and could never
  // submit their application at all.
  const hasVehicle = !!onboarding?.hasVehicle;
  const missingVehicleDocs = hasVehicle
    ? (onboarding?.steps?.vehicleDocs?.missing ?? onboarding?.missingVehicleDocs ?? [])
    : [];
  const vehicleDocsComplete = missingVehicleDocs.length === 0;

  // Driver KYC documents are ALWAYS compulsory; vehicle docs only apply
  // when the driver has registered a vehicle.
  const canSubmit = allDriverDocsUploaded && vehicleDocsComplete;

  function pickAndUpload(docType) {
    promptForImage({
      title: 'Upload document',
      message: 'Choose how to add this document',
      onPicked: (uri) => doUpload(docType, uri),
    });
  }

  async function doUpload(docType, uri) {
    setUploads((prev) => ({ ...prev, [docType]: { uri, status: 'uploading' } }));
    try {
      await documentsApi.upload(uri, docType);
      setUploads((prev) => ({ ...prev, [docType]: { uri, status: 'done' } }));
    } catch (err) {
      setUploads((prev) => ({ ...prev, [docType]: { uri, status: 'error' } }));
      Alert.alert('Upload failed', err.message || 'Please try again.');
    }
  }

  async function submitApplication() {
    if (!canSubmit) {
      // Driver documents are the compulsory part, so lead with those.
      if (!allDriverDocsUploaded) {
        Alert.alert('Documents missing', 'Please upload all 3 required driver documents before submitting.');
      } else {
        Alert.alert(
          'Vehicle documents missing',
          `You've registered a vehicle, so its documents are needed too. Please go back and upload: ${missingVehicleDocs.join(', ')}.`
        );
      }
      return;
    }

    Alert.alert(
      'Submit Application',
      'Once submitted, your application will be sent to the admin for review. You cannot make changes after submission.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Submit',
          onPress: async () => {
            if (submitting) return;
            setSubmitting(true);
            try {
              await driverApplicationApi.submit();
              // Registration is finished — send the driver to the Application
              // Pending screen for admin approval, and KEEP them signed in
              // (don't log them out). initSession() re-reads onboarding; with
              // all documents in and KYC not yet verified, Root() routes to
              // ApplicationPending, where they can watch their status and
              // re-check without having to log back in.
              Alert.alert(
                'Submitted for approval ✓',
                hasVehicle
                  ? "Your application is now pending admin approval. You'll be notified once it's approved — you can check the status any time from here."
                  : "Your application is now pending admin approval. You'll be notified once it's approved. A vehicle can be added from your Profile, or your admin can assign one to you.",
                [{ text: 'View status', onPress: () => { initSession(); } }],
                { cancelable: false },
              );
            } catch (err) {
              // The VEHICLE_REQUIRED workaround that used to live here is gone:
              // submitForReview() no longer demands a vehicle (see
              // driverSelf.service.js), so a vehicle-less submission now
              // succeeds instead of needing to be redirected.
              Alert.alert('Submission failed', err.message || 'Please try again.');
            } finally {
              setSubmitting(false);
            }
          },
        },
      ]
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>

      <StepIndicator hasVehicle={hasVehicle} />
      <View style={styles.stepLabels}>
        <Text style={styles.stepLabel}>Personal ✓</Text>
        <Text style={styles.stepLabel}>{hasVehicle ? 'Vehicle ✓' : 'Vehicle —'}</Text>
        <Text style={styles.stepLabel}>{hasVehicle ? 'Veh. Docs ✓' : 'Veh. Docs —'}</Text>
        <Text style={[styles.stepLabel, styles.stepLabelActive]}>Driver Docs</Text>
      </View>

      <Text style={styles.title}>Upload KYC Documents</Text>
      <Text style={styles.hint}>
        All 3 documents are required to complete your registration. Your
        application will be reviewed by the admin after submission — this is
        the final step.
      </Text>

      {/* No vehicle yet — allowed, but worth making the consequence explicit */}
      {!hasVehicle && (
        <View style={styles.infoBox}>
          <AlertCircle size={16} color={colors.primary} />
          <Text style={styles.infoText}>
            No vehicle registered. You can still submit for approval now — add a
            vehicle later from your Profile, or your admin can assign one to you.
            You won&apos;t be able to go online until a vehicle is assigned.
          </Text>
        </View>
      )}

      {/* Vehicle docs warning — only relevant when a vehicle exists */}
      {hasVehicle && !vehicleDocsComplete && (
        <View style={styles.warnBox}>
          <AlertTriangle size={16} color="#92400E" />
          <Text style={styles.warnText}>
            Vehicle documents still needed: {missingVehicleDocs.join(', ')}.
            Go back to the Vehicle Documents step to upload them before submitting.
          </Text>
        </View>
      )}

      {/* Driver KYC doc cards */}
      {DOCS.map((doc) => {
        const up     = uploads[doc.key];
        const status = statusOf(doc.key);
        const Icon   = doc.icon;

        return (
          <Card key={doc.key} style={styles.docCard}>
            <View style={styles.docRow}>
              <View style={[
                styles.docIconWrap,
                status === 'done' && styles.docIconDone,
              ]}>
                {status === 'uploading'
                  ? <ActivityIndicator size="small" color={colors.primary} />
                  : status === 'done'
                  ? <CheckCircle size={22} color="#fff" />
                  : status === 'error'
                  ? <AlertCircle size={22} color={colors.danger} />
                  : <Icon size={22} color={colors.primary} />
                }
              </View>

              <View style={styles.docInfo}>
                <Text style={styles.docLabel}>{doc.label}</Text>
                <Text style={styles.docDesc}>{doc.description}</Text>
                {status === 'done'  && <Text style={styles.docSuccess}>Uploaded ✓</Text>}
                {status === 'error' && <Text style={styles.docError}>Upload failed — tap to retry</Text>}
              </View>

              {up?.uri && status === 'done' && (
                <Image source={{ uri: up.uri }} style={styles.docThumb} />
              )}
            </View>

            <Pressable
              style={[
                styles.uploadBtn,
                status === 'done'     && styles.uploadBtnDone,
                status === 'uploading' && styles.uploadBtnLoading,
              ]}
              onPress={() => status !== 'uploading' && pickAndUpload(doc.key)}
              disabled={status === 'uploading'}
            >
              <Upload size={14} color={status === 'done' ? colors.success : colors.primary} />
              <Text style={[
                styles.uploadBtnText,
                status === 'done' && { color: colors.success },
              ]}>
                {status === 'done'     ? 'Replace'
                 : status === 'uploading' ? 'Uploading...'
                 : 'Upload'}
              </Text>
            </Pressable>
          </Card>
        );
      })}

      {/* Progress summary */}
      <View style={styles.progressRow}>
        <Text style={styles.progressText}>
          {DOCS.filter((d) => statusOf(d.key) === 'done').length} of {DOCS.length} driver documents uploaded
        </Text>
        {allDriverDocsUploaded && (
          <Text style={styles.progressDone}>All driver docs ready ✓</Text>
        )}
      </View>

      {/* Submit — gated on both driver + vehicle docs */}
      <Button
        label={submitting ? 'Submitting...' : 'Submit Application'}
        onPress={submitApplication}
        loading={submitting}
        disabled={!canSubmit}
        Icon={CheckCircle}
        IconRight={ChevronRight}
        flex={false}
        style={[styles.submitBtn, !canSubmit && styles.submitBtnDisabled]}
      />

      {!canSubmit && (
        <Text style={styles.submitHint}>
          {!vehicleDocsComplete
            ? `Complete vehicle docs first (${missingVehicleDocs.join(', ')}), then upload all 3 driver documents.`
            : 'Upload all 3 driver documents to enable submission.'}
        </Text>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container:        { flex: 1, backgroundColor: colors.background },
  content:          { padding: spacing.lg, paddingBottom: spacing.xl * 3 },
  stepRow:          { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.xs },
  stepDot:          { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  stepActive:       { backgroundColor: colors.primary, borderColor: colors.primary },
  stepDone:         { backgroundColor: colors.success, borderColor: colors.success },
  stepSkipped:      { backgroundColor: colors.surfaceAlt, borderColor: colors.border },
  stepNum:          { fontSize: 11, fontWeight: '700', color: '#fff' },
  stepNumSkipped:   { fontSize: 11, fontWeight: '700', color: colors.textMuted },
  stepLine:         { flex: 1, height: 2, backgroundColor: colors.border, marginHorizontal: 4 },
  stepLineDone:     { backgroundColor: colors.success },
  stepLabels:       { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.xl },
  stepLabel:        { fontSize: 10, color: colors.textMuted, fontWeight: '600', flex: 1, textAlign: 'center' },
  stepLabelActive:  { color: colors.primary },
  title:            { fontSize: 22, fontWeight: '800', color: colors.text, marginBottom: spacing.xs },
  hint:             { fontSize: 13, color: colors.textMuted, marginBottom: spacing.lg, lineHeight: 20 },
  warnBox:          { flexDirection: 'row', gap: spacing.sm, backgroundColor: '#FFFBEB', borderRadius: radius.md, borderWidth: 1, borderColor: '#FDE68A', padding: spacing.md, marginBottom: spacing.lg },
  warnText:         { flex: 1, fontSize: 12, color: '#92400E', lineHeight: 17 },
  infoBox:          { flexDirection: 'row', gap: spacing.sm, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: spacing.lg },
  infoText:         { flex: 1, fontSize: 12, color: colors.textMuted, lineHeight: 17 },
  docCard:          { marginBottom: spacing.md, padding: spacing.md },
  docRow:           { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, marginBottom: spacing.sm },
  docIconWrap:      { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, flexShrink: 0 },
  docIconDone:      { backgroundColor: colors.success, borderColor: colors.success },
  docInfo:          { flex: 1 },
  docLabel:         { fontSize: 14, fontWeight: '700', color: colors.text, marginBottom: 2 },
  docDesc:          { fontSize: 12, color: colors.textMuted, lineHeight: 16 },
  docSuccess:       { fontSize: 12, color: colors.success, fontWeight: '600', marginTop: 3 },
  docError:         { fontSize: 12, color: colors.danger, fontWeight: '600', marginTop: 3 },
  docThumb:         { width: 48, height: 48, borderRadius: 6, borderWidth: 1, borderColor: colors.border },
  uploadBtn:        { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 14, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.primary, alignSelf: 'flex-start' },
  uploadBtnDone:    { borderColor: colors.success },
  uploadBtnLoading: { opacity: 0.6 },
  uploadBtnText:    { fontSize: 13, fontWeight: '600', color: colors.primary },
  progressRow:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.lg, marginTop: spacing.xs },
  progressText:     { fontSize: 13, color: colors.textMuted },
  progressDone:     { fontSize: 13, color: colors.success, fontWeight: '700' },
  submitBtn:        { alignSelf: 'stretch', marginTop: spacing.sm },
  submitBtnDisabled:{ opacity: 0.4 },
  submitHint:       { fontSize: 12, color: colors.textMuted, textAlign: 'center', marginTop: spacing.sm },
});
