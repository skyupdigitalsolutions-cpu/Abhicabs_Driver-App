/**
 * src/buildInfo.ts
 *
 * A build stamp shown on the Login screen.
 *
 * Why this exists: several "the fix isn't working" reports turned out to be
 * an APK built before the fix landed — with no way to tell from the UI which
 * build was actually installed, every such report cost a round trip of
 * guessing. Bump BUILD_TAG whenever you cut a new build; if the value on the
 * Login screen doesn't match the build you expect, you're running a stale
 * APK and nothing else about the report is trustworthy yet.
 */
export const BUILD_TAG = '2026.11.18-b24';

// Short summary of what changed in this build, for the same reason.
export const BUILD_NOTES = 'b24: merged GitHub main with b22/b23 (Earnings removed, admin-added drivers skip verification, iOS 15.1 build config); API on AWS everywhere. Prev: b21: build config — added production:apk EAS profile (production-signed APK); verified Play-ready config. Builds on b20 branding pass';
