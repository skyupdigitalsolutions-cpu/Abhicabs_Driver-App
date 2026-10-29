// @ts-nocheck
/**
 * App.js — session + onboarding-state root router.
 *
 * Routing:
 *   status 'loading'          → splash
 *   status 'unauthenticated'  → Auth stack (Login → Register)
 *   authenticated, NOT yet approved → Onboarding stack, advanced by onboarding
 *     state so the driver is forced through KYC before reaching the app:
 *       no vehicle              → RegisterVehicle
 *       vehicle, RC/INS/PUC     → VehicleDocuments
 *       veh docs, driver KYC    → DocumentUpload (licence/aadhaar/photo + submit)
 *       all docs, awaiting admin → ApplicationPending
 *   driverStatus 'approved'   → MainTabs
 *
 * Each onboarding screen just calls refresh() (re-fetches /driver/me); that
 * updates `onboarding` here, recomputes the step, and the keyed navigator
 * remounts onto the next screen. No screen needs to navigate manually.
 */
import { useEffect } from 'react';
import { ActivityIndicator, View, StyleSheet, Text } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { WifiOff } from 'lucide-react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Provider } from 'react-redux';

import { store } from './src/store/store';
import { MainTabs } from './src/navigation/MainTabs';
import { LoginScreen } from './src/screens/LoginScreen';
import { RegisterScreen } from './src/screens/RegisterScreen';
import { RegisterVehicleScreen } from './src/screens/RegisterVehicleScreen';
import { VehicleDocumentsScreen } from './src/screens/VehicleDocumentsScreen';
import { DocumentUploadScreen } from './src/screens/DocumentUploadScreen';
import { ApplicationPendingScreen } from './src/screens/ApplicationPendingScreen';
import { useSession, initSession, logout } from './src/store/session';
import { Button } from './src/components/Button';
import { colors, spacing, type } from './src/theme';

const AuthStack = createNativeStackNavigator();
const OnboardingStack = createNativeStackNavigator();

function AuthNavigator() {
  return (
    <AuthStack.Navigator screenOptions={{ headerShown: false }}>
      <AuthStack.Screen name="Login" component={LoginScreen} />
      <AuthStack.Screen name="Register" component={RegisterScreen} />
    </AuthStack.Navigator>
  );
}

function OnboardingNavigator({ initialRouteName }) {
  return (
    <OnboardingStack.Navigator initialRouteName={initialRouteName} screenOptions={{ headerShown: true }}>
      <OnboardingStack.Screen
        name="RegisterVehicle"
        component={RegisterVehicleScreen}
        options={{ title: 'Register Vehicle' }}
      />
      <OnboardingStack.Screen
        name="VehicleDocuments"
        component={VehicleDocumentsScreen}
        options={{ title: 'Vehicle Documents' }}
      />
      <OnboardingStack.Screen
        name="DocumentUpload"
        component={DocumentUploadScreen}
        options={{ title: 'Driver Documents' }}
      />
      <OnboardingStack.Screen
        name="ApplicationPending"
        component={ApplicationPendingScreen}
        options={{ headerShown: false }}
      />
    </OnboardingStack.Navigator>
  );
}

function onboardingStep(onboarding, vehicleSkipped) {
  const ob = onboarding || {};
  const hasVehicle = !!ob.hasVehicle;
  // Vehicle is optional (see store/session.js) — only force RegisterVehicle
  // if the driver hasn't been given the choice yet. Once they have one, or
  // have chosen to skip, vehicle-document upload has nothing to attach to,
  // so it's skipped too — straight to the driver's own KYC docs.
  const vehDocsMissing = hasVehicle && (!Array.isArray(ob.missingVehicleDocs) || ob.missingVehicleDocs.length > 0);
  const drvDocsMissing = !Array.isArray(ob.missingDriverDocs) || ob.missingDriverDocs.length > 0;

  if (!hasVehicle && !vehicleSkipped) return 'RegisterVehicle';
  if (vehDocsMissing) return 'VehicleDocuments';
  if (drvDocsMissing) return 'DocumentUpload';
  return 'ApplicationPending';
}

function SessionErrorScreen({ message }) {
  return (
    <View style={styles.splash}>
      <WifiOff size={44} color={colors.textMuted} />
      <Text style={styles.errorTitle}>Can't reach ABHI CABS</Text>
      <Text style={styles.errorBody}>{message || 'Check your internet connection and try again.'}</Text>
      <Button label="Try again" flex={false} style={styles.errorBtn} onPress={() => initSession()} />
      <Button label="Log out" variant="ghost" flex={false} style={styles.errorBtn} onPress={logout} />
    </View>
  );
}

function Root() {
  const { status, driverStatus, onboarding, vehicleSkipped, error } = useSession();

  useEffect(() => {
    initSession();
  }, []);

  // Session couldn't be loaded because of the network/server (NOT an auth
  // failure). Previously this case logged the driver out.
  if (status === 'error') return <SessionErrorScreen message={error} />;

  if (status === 'loading' || (status === 'authenticated' && driverStatus === 'loading')) {
    return (
      <View style={styles.splash}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (status !== 'authenticated') return <AuthNavigator />;

  // KYC verified by an admin → full app.
  if (driverStatus === 'approved') return <MainTabs />;

  // Otherwise walk the driver through onboarding, one step at a time.
  const step = onboardingStep(onboarding, vehicleSkipped);
  return <OnboardingNavigator key={step} initialRouteName={step} />;
}

export default function App() {
  // The Login title uses Montserrat_700Bold, which was referenced but never
  // loaded (the font package was installed and unused), so iOS logged
  // "Unrecognized font family" and fell back. Load it once here; a load
  // failure must not block the app, so fontError also releases the splash.
  // Required by file (not via the package index), which would otherwise
  // bundle all 18 Montserrat weights (~3.5 MB) into the app.
  const [fontsLoaded, fontError] = useFonts({});

  return (
    <Provider store={store}>
      <StatusBar style="dark" />
      {fontsLoaded || fontError ? (
        <NavigationContainer>
          <Root />
        </NavigationContainer>
      ) : (
        <View style={styles.splash}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      )}
    </Provider>
  );
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
    padding: spacing.xl,
  },
  errorTitle: { ...type.h2, color: colors.text, marginTop: spacing.lg, textAlign: 'center' },
  errorBody:  { ...type.body, color: colors.textMuted, textAlign: 'center', marginTop: spacing.sm, marginBottom: spacing.xl },
  errorBtn:   { alignSelf: 'stretch', marginBottom: spacing.sm },
});