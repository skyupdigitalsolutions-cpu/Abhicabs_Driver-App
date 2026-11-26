ssh root@168.144.24.84

#!/bin/bash
# ============================================================
# ABHI CABS Driver App — APK Build Script
# Run this once on your Mac/Linux/Windows (WSL) machine.
# Builds a signed APK via EAS (Expo Application Services).
# No Android SDK install needed — build runs in Expo's cloud.
# ============================================================

set -e

echo ""
echo "═══════════════════════════════════════════════"
echo "  ABHI CABS Driver — APK Build"
echo "  Backend: https://abhicabsbackend-production.up.railway.app"
echo "═══════════════════════════════════════════════"
echo ""

# 1. Check Node is installed
if ! command -v node &>/dev/null; then
  echo "❌  Node.js not found. Install from https://nodejs.org (v18+)"
  exit 1
fi
echo "✅  Node $(node -v)"

# 2. Install dependencies
echo ""
echo "📦  Installing dependencies..."
npm install

# 3. Install EAS CLI globally if not present
if ! command -v eas &>/dev/null; then
  echo ""
  echo "📦  Installing EAS CLI..."
  npm install -g eas-cli
fi
echo "✅  EAS CLI $(eas --version)"

# 4. Login to Expo (skip if already logged in)
echo ""
echo "🔐  Logging in to Expo (creates a free account if you don't have one)..."
eas whoami 2>/dev/null || eas login

# 5. Link project to EAS (first time only — writes extra.eas.projectId to app.json)
if ! grep -q '"projectId"' app.json; then
  echo ""
  echo "🔗  Linking project to EAS..."
  eas init
fi

# 6. Build the APK
echo ""
echo "🏗️   Building APK (preview profile)..."
echo "    This builds in Expo's cloud — no Android SDK needed."
echo "    Build takes 5–15 minutes. You'll get a download link when done."
echo ""
eas build --platform android --profile preview --non-interactive

echo ""
echo "✅  Done! Download your APK from the URL above."
echo "    Install on any Android device: adb install app.apk"
echo "    Or share the EAS link directly with your team."
