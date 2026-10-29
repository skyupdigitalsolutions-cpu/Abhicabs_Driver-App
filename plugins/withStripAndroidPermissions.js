/**
 * plugins/withStripAndroidPermissions.js
 *
 * Guarantees that permissions the app does NOT use are removed from the
 * generated AndroidManifest on every `expo prebuild` / EAS build, no matter
 * which library injects them (expo-image-picker adds the media permissions;
 * expo-location can add background location).
 *
 * Why these three:
 *   READ_MEDIA_IMAGES / READ_MEDIA_VIDEO — the app uploads documents through the
 *     Android system photo picker, which needs no media permission, and never
 *     touches video. Keeping them triggers Google Play's Photo & Video
 *     Permissions declaration.
 *   ACCESS_BACKGROUND_LOCATION — live tracking is foreground-only; keeping this
 *     triggers Google Play's Background Location declaration + demo video.
 *
 * This is the reliable fix for an EAS workflow where android/ is gitignored and
 * regenerated each build (so hand-editing the native manifest does nothing, and
 * blockedPermissions alone has proven flaky). The plugin both deletes any
 * existing declaration and adds a tools:node="remove" entry, so library-merged
 * copies are stripped at manifest-merge time too.
 *
 * Idempotent: safe across repeated prebuilds.
 */
const { withAndroidManifest } = require('expo/config-plugins');

const STRIP = [
  'android.permission.READ_MEDIA_IMAGES',
  'android.permission.READ_MEDIA_VIDEO',
  'android.permission.ACCESS_BACKGROUND_LOCATION',
];

module.exports = function withStripAndroidPermissions(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;

    // Ensure the `tools` namespace exists so tools:node="remove" is valid.
    manifest.$ = manifest.$ || {};
    if (!manifest.$['xmlns:tools']) {
      manifest.$['xmlns:tools'] = 'http://schemas.android.com/tools';
    }

    const list = manifest['uses-permission'] || [];

    // 1) Drop any existing declarations of these permissions.
    const kept = list.filter((p) => !STRIP.includes(p && p.$ && p.$['android:name']));

    // 2) Add one tools:node="remove" entry per permission so a copy merged in
    //    from a library manifest is also stripped from the final merged manifest.
    for (const name of STRIP) {
      kept.push({ $: { 'android:name': name, 'tools:node': 'remove' } });
    }

    manifest['uses-permission'] = kept;
    return cfg;
  });
};
