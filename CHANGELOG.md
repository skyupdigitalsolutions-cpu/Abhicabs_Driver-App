# Changelog — build 2026.11.13-b23 (final)

## Manually-added (admin-created) drivers log in directly
- A driver added manually by admin (temporary / admin-created, `isTemporary`) now
  **skips the self-onboarding + KYC verification gate** and lands straight in the
  app on login — no Register Vehicle / Documents / Application Pending.
  (Regular self-registered drivers still go through verification as before.)
- Frontend: `store/session.ts` treats `onboarding.isTemporary` as approved.
- BACKEND (deploy required): `driverSelf.service.js` → `onboardingState()` now
  returns `isTemporary`. Without this backend change the app can't tell which
  drivers are admin-added, so deploy it alongside this build.

## iOS / Android build config fixed (so it builds cleanly)
- `eas.json`: `production` iOS builds now use the **Xcode 26 image** (`ios.image: "latest"`) — clears ITMS-90725 (iOS 26 SDK required).
- `app.json`: added `expo-build-properties` with `ios.deploymentTarget: "15.1"` and a Podfile `post_install` plugin (`./plugins/withIosDeploymentTarget`) that forces every pod to 15.1 — clears the "deployment target 13.4" errors.
- Added `owner` + EAS `projectId`, and installed `expo-build-properties`.
- **API now points at the live AWS backend** `https://api.abhicabs24x7.com/api/v1` (was the old Railway URL) across all build profiles.

## Earlier (b22 and before)
- Earnings tab removed (Home · Trips · Profile).
- Mobile-OTP login (email OTP removed), registration overhaul, vehicle catalogue + expiry dates, pickup-gated customer number, skip-vehicle fix, submit → Application Pending, full ABHI CABS branding, EAS production:apk profile.

# Changelog — build 2026.11.02-b22 (final, frontend-only)

Reconstructed cumulative build. Includes everything from b14–b21 plus b22.

## b22 — Earnings removed
- Removed the **Earnings** bottom tab (it was a "coming soon" placeholder). Bottom bar is now **Home · Trips · Profile**. Deleted `EarningsScreen.tsx`; removed its tab, import and icon entry from `MainTabs`.

## Carried over (b14–b21)
- **Login:** mobile number + OTP (email OTP removed); unregistered number → "Apply" carries the number into Register.
- **Register:** overhaul — phone prefilled, email optional, inline per-field errors, licence expiry, consent, proper error-code handling.
- **Vehicle registration:** vehicle types loaded live from the backend catalogue (all classes + per-type seats); optional insurance/PUC/fitness/permit **expiry dates**; "Skip for now" fixed (state flips before Keychain write).
- **Documents → submit:** lands on **Application Pending** (stays signed in) instead of logging out.
- **Trip:** customer phone number hidden until the driver reaches the pickup point.
- **Branding:** ABHI CABS logo across app icon, adaptive icon, splash (black + white logo), notification icon, and in-app (Login, Register, Application Pending, SOS, No-Vehicle, tab header).
- **Build config:** EAS `production:apk` profile added (production-signed APK alongside the Play AAB).

# Changelog — build 2026.10.07-b13 (bug-fix release)

## Critical (money / dispatch)
- **Wrong fare on completion.** "Complete Trip" sent the odometer *reading* as `actualKm` (distance driven). Now sends `actualKm = end − start` (omitted if the start reading is unknown) and blocks an end reading below the start. — `TripScreen.tsx`
- **GPS pings never carried `bookingId`.** `startLocationPinger()` set the getter then called `stopLocationPinger()`, which cleared it. Auto-arrive / checkpoints now work; overlapping ticks prevented; permission asked *before* telling the server "online". — `locationPinger.ts`, `HomeScreen.tsx`
- **Active trip corrupted by unrelated status events**, and `{ booking: null }` stored as an empty active trip. — `driverTrips.ts (unwrapBooking)`, `tripsSlice.ts`, `HomeScreen.tsx`
- **Realtime events lost/duplicated:** handlers registered while offline were dropped; every Go Online stacked more handlers; rooms weren't re-joined after reconnect; reconnects used a stale token; a second socket could be created while connecting. — `socket.ts`

## Session / auth
- Network error at launch no longer logs the driver out or sends an approved driver into onboarding — new "Can't reach ABHI CABS / Try again" screen. Only a 401 ends the session. — `session.ts`, `App.tsx`
- `refresh()` no longer remounts the whole app (lost navigation stack). Overlapping session loads can't clobber each other.
- Logout / session expiry now stop GPS, close the socket, go offline server-side, unregister the push token and reset Redux (previous driver's trips + stale "online" state leaked to the next login). Skip-vehicle flag cleared on logout.

## Crashes
- Recent Bookings read a deleted Redux slice → crash. Now lists finished trips.
- "Open Trip" on the assignment card while loading → null access.
- Empty strings rendered via `{str && <View/>}` ("Text strings must be rendered within <Text>").
- Temporary-driver login imported a non-existent module; `authApi.additions.ts` (non-module snippet) removed and its functions merged into `endpoints.ts`.

## Screens
- **Trip:** silent reloads (no full-screen spinner after each action; failed reload no longer shows "Trip not found"); Retry + pull-to-refresh; keyboard avoidance; Redux kept in sync after actions; `INVALID_OTP` handled; safe cash-collect message; support number from config.
- **Trips:** default tab was always empty (drivers never have PENDING/CONFIRMED) → Active / Upcoming / Past; refetch on focus; pull-to-refresh actually shows; duplicate pages prevented; correct distance/fare/customer fields; hook-in-render-prop removed.
- **Home:** refetch active trip on focus, pull-to-refresh, session refresh (vehicle approval noticed without restart); rollback if going online fails half-way.
- **Documents:** camera permission never requested if gallery was allowed; `image/jpg` MIME type; already-uploaded docs had to be re-uploaded; second vehicle's docs went to the first vehicle.
- **Vehicles from Profile:** after adding, goes to that vehicle's documents; per-vehicle "Upload / replace documents"; Profile refreshes on focus; skip option hidden outside onboarding; numeric/registration validation.
- **Application Pending:** status check gives feedback; REJECTED state shown; path back to documents / submit for drivers who never pressed Submit.
- **Login:** keyboard covered inputs; resend cooldown; Montserrat font was referenced but never loaded (now loads only the one weight).
- **Map:** location watcher leak on unmount; camera re-fit every 5 s.

## Config / build
- `EXPO_PUBLIC_API_BASE_URL` / `EXPO_PUBLIC_SUPPORT_PHONE` were ignored (hard-coded) — now `src/config.ts`.
- `expo-image-picker` pinned to SDK 51's `~15.0.7` (was 15.1.0).
- `eas.json`: removed invalid `autoCredentials`; removed `developmentClient` (expo-dev-client not installed); `appVersionSource: remote` + `autoIncrement` for production.
- `app.json`: removed placeholder `projectId` (broke `eas build`; `eas init` writes the real one); removed unused iOS background-location mode (App Store 2.5.4 rejection risk) and deprecated storage permissions; blocked background location / mic on Android. Native `ios/Info.plist` updated to match.
- README: removed the server SSH line; corrected lifecycle/OTP docs.

## iOS 27 SDK launch crash (Xcode 27)
- Apps built with the iOS 27 SDK must adopt the UIScene life cycle or UIKit stops them at launch (`__UIApplicationEvaluateRuntimeIssues`, EXC_BREAKPOINT in `main.m`). Added a `SceneDelegate` (in `AppDelegate.mm`) that attaches React Native's window to the scene and forwards deep links / size changes, plus `UIApplicationSceneManifest` in `Info.plist`.
- `plugins/withSceneLifecycle.js` (registered in `app.json`) re-applies this on every `expo prebuild` / EAS build, because `ios/` is git-ignored and regenerated there.
- Removed unused Google Maps SDK from iOS (it was initialised with a placeholder key); iOS uses Apple Maps.
- `expo-device` patched for newer Xcode (`TARGET_OS_SIMULATOR`), via `patch-package`.
