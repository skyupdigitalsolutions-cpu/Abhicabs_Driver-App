# Changelog — build 2026.10.09-b21 (config only)

## Android build config
- Added a **`production:apk`** EAS profile — a production-signed **APK** (same env/signing as `production`, internal distribution) so you can sideload a build identical to the Play release for final testing.
- Verified Play-readiness: `android.package` (`com.abhicabs.app`), version 1.0.0, `versionCode` left to EAS remote auto-increment, sensible permissions (fine/coarse location, notifications, camera), and `blockedPermissions` for background-location & record-audio (avoids Play's heavier review).

### Android build commands
- AAB (Play Store): `eas build -p android --profile production`
- Production-signed APK (sideload): `eas build -p android --profile production:apk`
- Quick test APK: `eas build -p android --profile preview`
- Submit to Play: `eas submit -p android --profile production` (needs a Play service-account key)

# Changelog — build 2026.10.09-b20 (frontend-only)

## Branding — full pass
- **Splash redesigned**: brand-black background (`#111111`) with the **white** ABHI CABS wordmark (uses the white logo variant). `assets/splash.png` regenerated; `app.json` splash background set to `#111111`.
- **Logo added** to the **SOS/Emergency** and **No-Vehicle** screens.
- Verified correct and crisp: app icon, Android adaptive icon (safe-zone + yellow background), notification silhouette (white on transparent), and the in-app logos on Login, Register, Application Pending and the main tab header (from b19).

### To see the new icon/splash in a build
A prebuilt `ios/` bakes icons at prebuild time, so regenerate after swapping assets:
`npx expo prebuild --platform ios --clean` → `cd ios && pod install` → `npx expo run:ios --configuration Release` (delete the installed app from the simulator first so a cached icon doesn't linger).

# Changelog — build 2026.10.09-b19 (frontend-only)

## Branding — ABHI CABS logo applied everywhere
- **App icon** (`assets/icon.png`), **Android adaptive icon** (foreground + brand-yellow background), **splash screen** (`assets/splash.png`) and **Android notification icon** (white silhouette) all regenerated from the supplied logos.
- New **`Logo` component** (`src/components/Logo.tsx`) with `color` (light bg), `white` (dark bg) and `mark` (square emblem) variants, backed by crisp PNGs rendered from the SVGs.
- Logo now shown in-app on: **Login** (replaces the old text wordmark), **Register**, **Application Pending**, and the **main tab header** (Home / Trips / Earnings / Profile).
- Assets added: `logo-color.png`, `logo-white.png`, `logo-mark.png`; `logo-full.svg` refreshed to the new colour wordmark; `app.json` adaptive-icon background set to `#FFC007`.
- Note: PNGs are used in-app rather than the raw SVGs because the wordmark contains live SF Pro text that wouldn't render consistently across platforms as SVG.

# Changelog — build 2026.10.09-b18 (frontend-only)

## Vehicle registration — capture compliance expiry dates (`RegisterVehicleScreen`)
- Added an optional **Document validity** section capturing **Insurance expiry, PUC expiry, Fitness expiry and Permit expiry** (YYYY-MM-DD).
- The backend already stored these (`vehicles.insurance_expiry / puc_expiry / fitness_expiry / permit_expiry`) and `registerVehicleSchema` already accepted them — the app simply never collected them. Now they're sent on `POST /driver/me/vehicles`.
- Each date is validated (real date, correct format) and left out of the payload when blank. An **inline warning** appears if any entered date is already in the past ("you won't be able to go online until they're renewed").

# Changelog — build 2026.10.09-b17 (frontend-only)

## After document submit → Application Pending (not logout) — `DocumentUploadScreen`
- Previously, submitting the application showed a thank-you and then **logged the driver out**, dumping them on the Login screen.
- Now, on a successful submit the app **keeps the driver signed in and moves straight to the Application Pending screen** (admin approval). It re-reads onboarding via `initSession()`; with all documents in and KYC not yet verified, the router lands on Pending — where the driver sees "Application received · KYC review in progress · you'll be notified", can tap "Check approval status", and is routed into the app automatically once an admin approves.
- Success copy updated to "Submitted for approval ✓ … now pending admin approval … check the status any time from here", with a "View status" button.

### Note (backend behaviour, unchanged)
- The backend's submit still **requires a registered vehicle** (`VEHICLE_REQUIRED`). A driver who skipped the vehicle step will get that error on submit and won't reach Pending until a vehicle is added. The in-app "you can submit without a vehicle" note won't hold on this backend. Allowing a vehicle-less submit would be a small backend change.

# Changelog — build 2026.10.08-b16 (frontend-only)

## New-driver registration — complete overhaul (`RegisterScreen`, `endpoints.ts`, `LoginScreen`)
- **Mobile number carried over from login.** When an unregistered number hits "No account found → Apply now", that number is passed to the registration form and pre-filled, so the driver doesn't retype it. — `LoginScreen.tsx`
- **Email is now optional** (it already was on the backend — a placeholder is generated when absent). Login is mobile-OTP, so email isn't the identity. The API layer now **omits an empty email** from the payload instead of sending `""`, which would have failed validation (422). — `endpoints.ts`, `RegisterScreen.tsx`
- **Inline, per-field validation.** Errors now appear under the specific field and clear as you edit it, instead of one blunt pop-up. Friendlier messages throughout.
- **Licence number** is normalised (uppercased, spaces stripped) with a sensible minimum length.
- **Licence expiry (optional)** added — validated as `YYYY-MM-DD` and rejected if already expired; omitted when blank.
- **Consent checkbox** — the driver confirms details and accepts terms before the account is created.
- **Proper error-code handling:** `DRIVER_EXISTS` → "sign in" prompt; `PHONE_TAKEN` → inline on the phone field; created-but-not-signed-in → "log in with your mobile number" (old copy wrongly said "log in with this email"); offline/server-unavailable handled distinctly.
- **Keyboard handling** (KeyboardAvoidingView), clearer helper text, and a reassurance line.
- Fixed stale copy that described login as email-OTP.

### Still needs the backend (not included — frontend-only)
- **Phone-OTP verification at signup.** There's no pre-account OTP endpoint, so the number isn't verified before the account is created (ownership is effectively proven on first OTP login). A true verify-before-create step needs a backend "registration OTP" route.

# Changelog — build 2026.10.08-b15 (frontend-only)

## Fix — "Skip for now" on vehicle registration
- Tapping **"I'll add my vehicle later" → "Skip for now"** could appear to do nothing. `skipVehicleRegistration()` was `await`ing the SecureStore (Keychain) write *before* flipping session state, and that native write can be slow or stall on some devices — holding up the state change that advances the onboarding step. — `store/session.ts`
- Now the session state flips **first** (the router advances to the next step immediately) and the flag is persisted in the background, best-effort. This matches what the code comment always intended ("flips session state synchronously").
- Closed a follow-on race: `initSession()` now preserves an in-session skip, so a refresh (e.g. on the Application-Pending screen) can't read the not-yet-written flag and bounce the driver back to Register Vehicle.

# Changelog — build 2026.10.08-b14 (FRONTEND-ONLY: mobile-OTP login, vehicle catalogue, pickup-gated customer number)

> Scope: driver app only. No backend changes are required or included.

## Login — mobile number + OTP (email OTP removed)
- Driver login now takes a **10-digit mobile number**; the OTP arrives by **SMS**. Email-OTP login is gone. — `LoginScreen.tsx`, `endpoints.ts`
- No backend change needed: `/auth/otp/request` and `/auth/otp/verify` already accept `{ phone }`, resolve the driver by the last 10 digits, send the code by SMS, and return `NOT_REGISTERED` for an unknown number (shown as an "Apply" prompt).
- Temporary-driver login screen converted to the same mobile-OTP flow — which also **fixes** temp-driver sign-in (their synthetic `@temp-driver.invalid` email can't receive a code; SMS to their real number does). — `TemporaryDriverLoginScreen.tsx`

## Vehicle registration — all backend types & seat counts
- Type list was hard-coded (sedan/SUV/tempo). It now loads **live from the backend catalogue** (public `GET /vehicles`), so a driver can register **every** class the platform offers (hatchback, etc.). — `RegisterVehicleScreen.tsx`, `endpoints.ts`
- Selecting a class pre-fills its correct **seat count** (still editable).
- If the catalogue can't be reached, a small set of common types is shown **with a visible Retry** — never a silent swap.

## Customer number hidden until pickup (client-side)
- The driver no longer sees the customer's phone number until they mark **"Arrived at Pickup"** (REACHED). Before that the Customer card shows "Available once you reach the pickup point" and no Call button. — `TripScreen.tsx`
- NOTE: this is a **UI gate only**. The backend still includes the number in the trip payload; the app hides it. To withhold it on the wire as well, the backend would need to omit `customer.phone` before REACHED — not included here (frontend-only).

## Findings that need the backend (NOT changed — frontend-only release)
- **"Arrived at destination" button** calls `POST /driver/bookings/:id/arrived`, which isn't a backend route (404). In practice it rarely matters: the backend **auto-arrives** when the driver's GPS gets within ~80 m of the drop, so Complete still works on the normal flow. The manual button needs a backend route to be a reliable fallback.
- **Driver-side reviews** (`RateCustomerScreen` → `POST /driver/bookings/:id/review`, `MyReviewsScreen` → `GET /driver/me/reviews`) call endpoints that don't exist; the backend only supports *customer-rates-driver*. These screens can't work until a backend feature is built or they're hidden.

---

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
