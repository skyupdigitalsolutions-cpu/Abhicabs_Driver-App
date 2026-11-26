# ABHI CABS Driver App — Build Guide

**Backend:** `https://abhicabsbackend-production.up.railway.app/api/v1`  
**Android package:** `com.abhicabs.app` · **iOS bundle ID:** `com.abhicabs.driver`

---

## Get the APK in 3 steps (no Android Studio needed)

### Step 1 — Prerequisites (one-time)

Install Node.js 18+ from https://nodejs.org

### Step 2 — Run the build script

```bash
# Make the script executable
chmod +x build-apk.sh

# Run it
./build-apk.sh
```

That's it. The script:
- Installs all npm packages
- Installs EAS CLI
- Asks you to log in to Expo (free account, 30 seconds)
- Queues a cloud build — Expo's servers build the APK, not your machine
- Prints a download link when done (~10 min)

### Step 3 — Install on device

```bash
# Via ADB
adb install your-app.apk

# Or just share the EAS download link — anyone can install it
```

---

## Manual commands (if the script fails)

```bash
npm install
npm install -g eas-cli
eas login
eas init          # link to your Expo account (writes the projectId into app.json)
eas build --platform android --profile preview
```

---

## Build profiles

| Profile | Output | Use for |
|---------|--------|---------|
| `preview` | `.apk` | Testing, sharing with team |
| `production` | `.aab` | Google Play Store upload |

---

## What changed in this build vs. the original

### Bug fixes (all per handoff documents)
| Area | What was wrong | Fixed |
|------|----------------|-------|
| Auth | OTP sent `{email}` → backend needed `{phone}` | ✅ `{phone}` |
| Trip list | Driver saw **all** customers' bookings (IDOR/BOLA) | ✅ `GET /driver/bookings` |
| Active trip | Wrong trip could show (first ALLOCATED in table) | ✅ `GET /driver/bookings/active` |
| Trip detail | Unscoped `GET /bookings/:id` | ✅ `GET /driver/bookings/:id` |
| Offer accept/decline | Endpoints removed on backend, still called | ✅ Removed |
| Offer countdown | 3-min countdown for a flow that doesn't exist | ✅ Removed |
| GPS ping | No `bookingId` → no auto-arrive possible | ✅ `bookingId` sent |
| Push token | POST `/driver/push-tokens` was 404 | ✅ POST `/device-tokens` |
| Fare fields | `baseFare`, `tax`, `estimatedKm` don't exist | ✅ `distanceKm`, `estimatedFare`, `finalFare` |
| Trip complete | "Complete Trip" only submitted odometer, didn't close trip | ✅ Calls `/complete` |
| Vehicle docs | No screen to upload RC/Insurance/PUC → submit always 422 | ✅ New VehicleDocumentsScreen |
| Submit gate | Only checked driver docs, not vehicle docs | ✅ Both checked |
| Token storage | JWT in plaintext AsyncStorage | ✅ expo-secure-store |
| fuelType | Sent but stripped by backend silently | ✅ Removed |

### Build 2026.10.07-b13 — bug-fix release
See `CHANGELOG.md` for the full list. Configuration now comes from
`EXPO_PUBLIC_API_BASE_URL` / `EXPO_PUBLIC_SUPPORT_PHONE` (`.env` locally, the
`env` block of each `eas.json` profile on EAS), with the production values as
fallbacks. Build numbers are managed by EAS (`appVersionSource: remote`,
`autoIncrement` on production).

### New feature — OTP ride start (like Uber/Rapido)
- Driver arrives at pickup → marks **"Arrived at pickup"**
- Backend generates 6-digit OTP → sent to customer via SMS/push
- Driver app shows OTP entry screen → driver asks customer for code
- Driver enters OTP → taps **"Verify OTP & Start Ride"**
- Backend validates → trip goes `REACHED → ONGOING`
- Wrong OTP → error shown inline, driver tries again

### Driver lifecycle buttons
```
ALLOCATED / EN_ROUTE → [Arrived at Pickup]                → REACHED
REACHED              → [Verify OTP + start odometer]      → ONGOING
ONGOING              → [Arrived at destination]           → ARRIVED
ARRIVED              → [Complete Trip]                    → COMPLETED
```

### New files added
- `src/api/driverTrips.ts` — all driver-scoped trip API calls
- `src/screens/VehicleDocumentsScreen.tsx` — RC / Insurance / PUC upload

---

## Backend notes for your backend dev

The OTP start requires one backend change on `POST /driver/bookings/:id/start`:
- Accept `{ otp }` in the body
- Validate against the OTP generated when `markReached()` was called
- Return `400 OTP_INVALID` on mismatch, `400 OTP_EXPIRED` if window passed
- All other lifecycle endpoints are already spec'd in Document B
