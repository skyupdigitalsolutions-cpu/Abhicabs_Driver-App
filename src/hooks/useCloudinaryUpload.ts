// @ts-nocheck
/**
 * useCloudinaryUpload — shared hook for document upload.
 * Shows an action sheet with two options: Take Photo or Choose from Gallery.
 *
 * Usage:
 *   const { uploading, upload } = useCloudinaryUpload({
 *     cloudName: CLOUDINARY_CLOUD_NAME,
 *     uploadPreset: CLOUDINARY_UPLOAD_PRESET,
 *     onSuccess: (docKey, result) => setDocuments(prev => ({ ...prev, [docKey]: result })),
 *   });
 *
 *   <DocUploadRow uploading={uploading === 'licencePhoto'}
 *     onPress={() => upload('licencePhoto')} ... />
 */
import { useState } from 'react';
import { Alert, Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';

const IMAGE_OPTIONS = { quality: 0.8, allowsEditing: false };

async function uploadToCloudinary(uri, cloudName, uploadPreset) {
  const formData = new FormData();
  formData.append('file', { uri, type: 'image/jpeg', name: 'upload.jpg' });
  formData.append('upload_preset', uploadPreset);
  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
    { method: 'POST', body: formData }
  );
  if (!res.ok) throw new Error('Upload failed — please try again.');
  const data = await res.json();
  return { url: data.secure_url, publicId: data.public_id };
}

export function useCloudinaryUpload({ cloudName, uploadPreset, onSuccess }) {
  const [uploading, setUploading] = useState(null);

  async function upload(docKey) {
    // Show action sheet — camera or gallery
    Alert.alert(
      'Upload Document',
      'Choose how to upload',
      [
        {
          text: '📷  Take Photo',
          onPress: () => pickFromCamera(docKey),
        },
        {
          text: '🖼️  Choose from Gallery',
          onPress: () => pickFromGallery(docKey),
        },
        {
          text: 'Cancel',
          style: 'cancel',
        },
      ],
      { cancelable: true }
    );
  }

  async function pickFromCamera(docKey) {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission needed', 'Please allow camera access in your phone settings.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync(IMAGE_OPTIONS);
    if (result.canceled) return;
    await doUpload(docKey, result.assets[0].uri);
  }

  async function pickFromGallery(docKey) {
    // Android uses the system photo picker (no media permission needed);
    // READ_MEDIA_IMAGES/VIDEO are blocked in app.json for Play policy. iOS still asks.
    if (Platform.OS !== 'android') {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permission needed', 'Please allow photo library access in your phone settings.');
        return;
      }
    }
    const result = await ImagePicker.launchImageLibraryAsync({ quality: 0.8 });
    if (result.canceled) return;
    await doUpload(docKey, result.assets[0].uri);
  }

  async function doUpload(docKey, uri) {
    setUploading(docKey);
    try {
      const uploaded = await uploadToCloudinary(uri, cloudName, uploadPreset);
      onSuccess(docKey, uploaded);
    } catch (err) {
      Alert.alert('Upload failed', err.message || 'Please try again.');
    } finally {
      setUploading(null);
    }
  }

  return { uploading, upload };
}
