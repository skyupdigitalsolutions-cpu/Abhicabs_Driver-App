// @ts-nocheck
/** src/api/upload.ts — multipart file-part helper shared by every upload. */

const MIME_BY_EXT = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
  heic: 'image/heic', heif: 'image/heif', gif: 'image/gif', pdf: 'application/pdf',
};

/**
 * Build the { uri, name, type } part React Native's FormData expects.
 * Previously each upload derived the MIME type as `image/${ext}`, which
 * produced invalid types like `image/jpg` (rejected by strict multipart
 * validators) and broke on URIs with a query string or no extension.
 */
export function fileFromUri(uri, fallbackName = 'upload.jpg') {
  const clean = String(uri).split('?')[0];
  const name = clean.split('/').pop() || fallbackName;
  const ext = (/\.(\w+)$/.exec(name)?.[1] || '').toLowerCase();
  const type = MIME_BY_EXT[ext] || 'image/jpeg';
  return { uri, name: ext ? name : `${name}.jpg`, type };
}
