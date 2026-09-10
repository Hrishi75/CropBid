// Three tabs, each with its own stack where it needs one.
//
// Shop sits in the Home STACK rather than being a tab of its own: opening a
// shop is going deeper into browsing, not switching task, and a shop with no
// way back to the list it came from is how the first version stranded people.
//
// Orders sits in the PROFILE stack for the same kind of reason in reverse: it
// is not something you switch to while shopping, it is something that is true
// about your account. types.ts has the full argument.

import { NavigationContainer, type LinkingOptions } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import ShopsScreen from '../screens/ShopsScreen';
import ShopScreen from '../screens/ShopScreen';
import CartScreen from '../screens/CartScreen';
import OrdersScreen from '../screens/OrdersScreen';
import ProfileScreen from '../screens/ProfileScreen';
import TabBar from './TabBar';
import type { HomeStackParamList, ProfileStackParamList, RootTabParamList } from './types';

const Stack = createNativeStackNavigator<HomeStackParamList>();
const ProfileStack = createNativeStackNavigator<ProfileStackParamList>();
const Tabs = createBottomTabNavigator<RootTabParamList>();

function HomeStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Shops" component={ShopsScreen} />
      <Stack.Screen name="Shop" component={ShopScreen} />
    </Stack.Navigator>
  );
}

// Orders sits inside the account rather than on the bar. See types.ts for why.
function ProfileStackScreen() {
  return (
    <ProfileStack.Navigator screenOptions={{ headerShown: false }}>
      <ProfileStack.Screen name="Profile" component={ProfileScreen} />
      <ProfileStack.Screen name="Orders" component={OrdersScreen} />
    </ProfileStack.Navigator>
  );
}

// URLs for the same screens.
//
// On web this gives a shop its own address, so it can be bookmarked, shared, or
// reloaded without being thrown back to the city list. On native the same
// config makes cropbiddaily:// links land on the right screen.
//
// The city rides in the query string because the server refuses a shop lookup
// without one: /shop/abc?city=Pune is a complete address, /shop/abc is not.
//
// initialRouteName is what gives a deep link a back stack. Without it, opening
// /shop/:id cold builds a stack holding only that screen and the back control
// has nothing to pop to.
const linking: LinkingOptions<RootTabParamList> = {
  prefixes: ['cropbiddaily://', 'https://daily.cropbid.in'],
  config: {
    screens: {
      Home: {
        screens: {
          Shops: '',
          Shop: 'shop/:id',
        },
        initialRouteName: 'Shops',
      },
      Cart: 'cart',
      You: {
        screens: {
          Profile: 'you',
          Orders: 'orders',
        },
        initialRouteName: 'Profile',
      },
    },
  },
};

export default function RootNavigator() {
  return (
    <NavigationContainer linking={linking}>
      <Tabs.Navigator
        screenOptions={{ headerShown: false }}
        tabBar={(props) => <TabBar {...props} />}
      >
        <Tabs.Screen name="Home" component={HomeStack} options={{ title: 'Shop' }} />
        <Tabs.Screen name="Cart" component={CartScreen} options={{ title: 'Basket' }} />
        <Tabs.Screen name="You" component={ProfileStackScreen} options={{ title: 'You' }} />
      </Tabs.Navigator>
    </NavigationContainer>
  );
}
