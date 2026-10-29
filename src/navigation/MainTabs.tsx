// @ts-nocheck
/**
 * src/navigation/MainTabs.jsx
 *
 * CHANGES:
 *   • TripScreen added as a stack screen (drivers navigate here from HomeScreen
 *     and TripsScreen via navigation.navigate('Trip', { bookingId })).
 *   • VehicleDocumentsScreen added as a stack screen (new onboarding step 3).
 *   • recentActionsSlice import removed — slice deleted (offer flow gone, PD-2=A).
 */
import { Alert, Pressable, StyleSheet, View, Text } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useSelector } from 'react-redux';
import { Home, ClipboardList, DollarSign, User, Bell } from 'lucide-react-native';
import { HomeScreen }                from '../screens/HomeScreen';
import { TripsScreen }               from '../screens/TripsScreen';
import { EarningsScreen }            from '../screens/EarningsScreen';
import { ProfileScreen }             from '../screens/ProfileScreen';
import { NotificationsScreen }       from '../screens/NotificationsScreen';
import { RegisterVehicleScreen }     from '../screens/RegisterVehicleScreen';
import { VehicleDocumentsScreen }    from '../screens/VehicleDocumentsScreen';
import { TripScreen }                from '../screens/TripScreen';
import { RecentBookingsScreen }      from '../screens/RecentBookingsScreen';
import { MyReviewsScreen }           from '../screens/MyReviewsScreen';
import { RateCustomerScreen }        from '../screens/RateCustomerScreen';
import { usePushNotifications }      from '../lib/pushNotifications';
import { Logo }                     from '../components/Logo';
import { colors } from '../theme';

const Tab   = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

const TAB_ICONS = {
  Home:     Home,
  Trips:    ClipboardList,
  Earnings: DollarSign,
  Profile:  User,
};

function BellButton({ navigation }) {
  const unreadCount = useSelector((s) => s.notifications.unreadCount);
  return (
    <Pressable
      onPress={() => navigation.navigate('Notifications')}
      style={styles.bellBtn}
      hitSlop={8}
    >
      <Bell size={22} color={colors.text} />
      {unreadCount > 0 && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
        </View>
      )}
    </Pressable>
  );
}

function TabsWithNotifications() {
  // Registers push token on entering the main app.
  usePushNotifications();

  const isOnline = useSelector((s) => s.driverStatus.isOnline);

  // Gate: until the driver goes online (from the Home tab), Trips, Earnings
  // and Profile are locked — tapping them shows a nudge back to Home instead
  // of navigating. Home itself is always reachable, since that's where the
  // Go Online control lives.
  const blockIfOffline = (label) => ({
    tabPress: (e) => {
      if (!isOnline) {
        e.preventDefault();
        Alert.alert('Go online first', `Go online from the Home tab to access ${label}.`);
      }
    },
  });

  return (
    <Stack.Navigator>
      <Stack.Screen name="Tabs" options={{ headerShown: false }}>
        {() => (
          <Tab.Navigator
            screenOptions={({ route, navigation }) => {
              const IconComp = TAB_ICONS[route.name];
              return {
                headerShown: true,
                headerTitle: () => <Logo variant="color" width={120} />,
                headerTitleAlign: 'center',
                tabBarActiveTintColor:         colors.primaryText,
                tabBarInactiveTintColor:       colors.textMuted,
                tabBarActiveBackgroundColor:   colors.primary,
                tabBarInactiveBackgroundColor: colors.surface,
                tabBarStyle:                   { borderTopWidth: 1, borderTopColor: colors.border },
                tabBarLabelStyle:              { fontSize: 11, fontWeight: '600' },
                tabBarIcon: ({ color, size }) => (
                  IconComp ? <IconComp size={size ?? 22} color={color} /> : null
                ),
                headerRight: () => <BellButton navigation={navigation} />,
              };
            }}
          >
            <Tab.Screen name="Home"     component={HomeScreen} />
            <Tab.Screen name="Trips"    component={TripsScreen}    listeners={blockIfOffline('Trips')} />
            <Tab.Screen name="Earnings" component={EarningsScreen} listeners={blockIfOffline('Earnings')} />
            {/* Profile intentionally NOT gated — it's the only place to Log
                Out and to register/manage a vehicle, so locking it behind
                "online" could trap an offline driver with no way out. */}
            <Tab.Screen name="Profile"  component={ProfileScreen} />
          </Tab.Navigator>
        )}
      </Stack.Screen>

      {/* Notifications bell */}
      <Stack.Screen
        name="Notifications"
        component={NotificationsScreen}
        options={{ title: 'Notifications', headerShown: true }}
      />

      {/* Trip detail — navigated from HomeScreen and TripsScreen */}
      <Stack.Screen
        name="Trip"
        component={TripScreen}
        options={{ title: 'Trip Details', headerShown: true }}
      />

      {/* Onboarding: step 2 — register vehicle */}
      <Stack.Screen
        name="RegisterVehicle"
        component={RegisterVehicleScreen}
        options={{ title: 'Register Vehicle', headerShown: true }}
      />

      {/* Onboarding: step 3 — vehicle documents (RC, Insurance, PUC) */}
      <Stack.Screen
        name="VehicleDocuments"
        component={VehicleDocumentsScreen}
        options={{ title: 'Vehicle Documents', headerShown: true }}
      />

      {/* Recent bookings (no longer offer history — just trip history) */}
      <Stack.Screen
        name="RecentBookings"
        component={RecentBookingsScreen}
        options={{ title: 'Recent Bookings', headerShown: true }}
      />

      {/* Driver's own reviews & ratings — reached from Profile */}
      <Stack.Screen
        name="MyReviews"
        component={MyReviewsScreen}
        options={{ title: 'My Reviews & Ratings', headerShown: true }}
      />

      {/* Rate the customer — opened on trip completion, or from a completed trip */}
      <Stack.Screen
        name="RateCustomer"
        component={RateCustomerScreen}
        options={{ title: 'Rate Customer', headerShown: true }}
      />
    </Stack.Navigator>
  );
}

export function MainTabs() {
  return <TabsWithNotifications />;
}

const styles = StyleSheet.create({
  bellBtn:   { marginRight: 12, position: 'relative' },
  badge:     { position: 'absolute', top: -6, right: -6, backgroundColor: colors.danger, borderRadius: 10, minWidth: 18, height: 18, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },
});
