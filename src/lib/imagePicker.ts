// @ts-nocheck
/**
 * src/lib/imagePicker.ts — one camera/gallery picker for every upload.
 *
 * FIX: the document screens asked for photo-library permission first and only
 * fell back to camera permission if that was DENIED. A driver who allowed the
 * library therefore never got the camera prompt, and "Take Photo" failed
 * silently. Each source now requests its own permission when chosen, and a
 * permanently-denied permission offers a shortcut to Settings.
 */
import { Alert, Linking, Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';

const PICK_OPTIONS = {
  mediaTypes: ImagePicker.MediaTypeOptions.Images,
  quality: 0.8,
};

function permissionDenied(what) {
  Alert.alert(
    'Permission needed',
    `Please allow ${what} access for ABHI CABS Driver in your phone settings.`,
    [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Open Settings', onPress: () => Linking.openSettings().catch(() => {}) },
    ],
  );
}

/** Launch one source. Resolves to a local file URI, or null if cancelled/denied. */
export async function pickImageFrom(source, { allowsEditing = false } = {}) {
  try {
    if (source === 'camera') {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) { permissionDenied('camera'); return null; }
      const res = await ImagePicker.launchCameraAsync({ ...PICK_OPTIONS, allowsEditing });
      return res.canceled ? null : res.assets?.[0]?.uri ?? null;
    }
    // Gallery. On Android we use the system photo picker, which needs NO media
    // permission — so we skip the permission request (READ_MEDIA_IMAGES/VIDEO are
    // blocked in app.json to satisfy Google Play's Photo & Video Permissions
    // policy). iOS still requests library access.
    if (Platform.OS !== 'android') {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) { permissionDenied('photo library'); return null; }
    }
    const res = await ImagePicker.launchImageLibraryAsync({ ...PICK_OPTIONS, allowsEditing });
    return res.canceled ? null : res.assets?.[0]?.uri ?? null;
  } catch (err) {
    Alert.alert('Could not open ' + (source === 'camera' ? 'camera' : 'gallery'), err?.message || 'Please try again.');
    return null;
  }
}

/**
 * Show "Take Photo / Choose from Gallery" and call onPicked(uri) with the result.
 */
export function promptForImage({ title = 'Add photo', message = 'Choose how to add this photo', allowsEditing = false, onPicked }) {
  const run = async (source) => {
    const uri = await pickImageFrom(source, { allowsEditing });
    if (uri) await onPicked(uri);
  };
  Alert.alert(title, message, [
    { text: '📷  Take Photo', onPress: () => run('camera') },
    { text: '🖼️  Choose from Gallery', onPress: () => run('library') },
    { text: 'Cancel', style: 'cancel' },
  ], { cancelable: true });
}
