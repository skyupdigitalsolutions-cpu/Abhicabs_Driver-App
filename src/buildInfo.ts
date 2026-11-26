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
export const BUILD_TAG = '2026.11.13-b23';

// Short summary of what changed in this build, for the same reason.
export const BUILD_NOTES = 'b23: manually-added (admin) drivers log in directly (skip verification); iOS/Android build config fixed (Xcode 26 image + deployment target 15.1); API points to AWS backend. Includes b22 Earnings removal and all prior features';
