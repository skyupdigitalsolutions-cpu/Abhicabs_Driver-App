// @ts-nocheck
/**
 * NoVehicleScreen
 *
 * COMPATIBILITY FIX: this screen previously assumed vehicles were assigned
 * only by a fleet manager, which is no longer how the app works — a driver
 * registers/owns their own vehicle via RegisterVehicleScreen, and doing so
 * is OPTIONAL during onboarding.
 *
 * UPDATE: the backend's onboarding response now includes
 * `vehicleFeatureAvailable` — false while the vehicle-ownership tables
 * genuinely don't exist in the database yet (a real backend limitation, not
 * a bug in this screen). When that's the case, "Add Vehicle" would just
 * bounce off a 503 after the driver fills in the whole form, so it's hidden
 * and replaced with an honest explanation instead.
 *
 * Shown whenever the signed-in driver has no vehicle on file, regardless of
 * KYC status. Gives the driver two real choices:
 *   - Add Vehicle now      -> RegisterVehicleScreen (only offered when the
 *     backend reports the feature is actually available)
 *   - Continue without one -> proceeds into the normal application/home
 *     flow (App.jsx decides Pending vs Main from there).
 *
 * This screen never blocks login, and never implies the driver is stuck.
 */
import { StyleSheet, Text, View } from 'react-native';
import { Car, Plus, ArrowRight, LogOut, Info } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import { colors, spacing, type } from '../theme';
import { Button } from '../components/Button';
import { Logo } from '../components/Logo';
import { Card } from '../components/Card';
import { InfoRow } from '../components/InfoRow';
import { logout, useSession } from '../store/session';

export function NoVehicleScreen({ onContinueWithoutVehicle }) {
  const navigation = useNavigation();
  const { onboarding } = useSession();
  // Defaults to available (true) so this doesn't punish a driver on a stale
  // onboarding read — only hides "Add Vehicle" once the backend has actually
  // told us the feature is off.
  const vehicleAvailable = onboarding?.vehicleFeatureAvailable !== false;

  return (
    <View style={styles.container}>
      <Logo variant="color" width={150} style={{ marginBottom: spacing.lg }} />
      <View style={styles.iconCircle}>
        <Car size={44} color={colors.primary} />
      </View>

      <Text style={styles.title}>No Vehicle Yet</Text>
      <Text style={styles.body}>
        {vehicleAvailable
          ? "Your driver application can be submitted without a vehicle. You can add a vehicle later from My Vehicles. You will be able to receive trips only after an approved vehicle is linked to your account."
          : "Your driver application can be submitted without a vehicle. Vehicle registration is temporarily unavailable — you'll be able to add one from My Vehicles once it's back."}
      </Text>

      {vehicleAvailable ? (
        <Card style={styles.card}>
          <InfoRow Icon={Car} text="Adding a vehicle now is optional" />
          <InfoRow Icon={ArrowRight} text="Your driver application continues either way" last />
        </Card>
      ) : (
        <Card style={styles.card}>
          <InfoRow Icon={Info} text="Vehicle registration is temporarily unavailable" />
          <InfoRow Icon={ArrowRight} text="Your driver application continues either way" last />
        </Card>
      )}

      {vehicleAvailable && (
        <Button
          label="Add Vehicle"
          Icon={Plus}
          onPress={() => navigation.navigate('RegisterVehicle')}
          flex={false}
          style={styles.btn}
        />
      )}

      <Button
        label={vehicleAvailable ? "I'll Add It Later / Continue Without Vehicle" : 'Continue Without Vehicle'}
        variant={vehicleAvailable ? 'secondary' : 'primary'}
        Icon={ArrowRight}
        onPress={onContinueWithoutVehicle}
        flex={false}
        style={styles.btn}
      />

      <Button
        label="Log Out"
        variant="danger"
        Icon={LogOut}
        onPress={logout}
        flex={false}
        style={styles.logoutBtn}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    padding: spacing.xl, backgroundColor: colors.background,
  },
  iconCircle: {
    width: 96, height: 96, borderRadius: 48,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: spacing.lg,
    borderWidth: 2, borderColor: colors.primary,
  },
  title: { ...type.h1, color: colors.text, textAlign: 'center', marginBottom: spacing.sm },
  body: {
    ...type.body, color: colors.textMuted, textAlign: 'center',
    marginBottom: spacing.xl, lineHeight: 22,
  },
  card: { width: '100%', marginBottom: spacing.xl, gap: spacing.md },
  btn: { width: '100%', marginBottom: spacing.md },
  logoutBtn: { width: '100%' },
});
