// Root navigation. Gates on auth state from AuthContext: shows a loader while
// restoring the session, then — signed out — the GUEST storefront, not a login
// wall: guests land straight on StorefrontHomeScreen, browse the market and
// open listings, and only hit Login/Signup when they try to act (buy, bid,
// sell, profile). Once signed in, the tab navigator for the user's role.
// Every role's HOME tab is the shared StorefrontHomeScreen (the web homepage
// mirrored on mobile); the old farmer and buyer dashboards live on their own
// tabs (My Farm / Dashboard). Farmers get Home/My Crops/Offers/Farm/You (their
// AI helper is pushed from Profile), buyers get Home/Dashboard/Agents/
// Contracts/You + Auction in the stack, consumers (instant-buy any quantity,
// no bidding) get a lean Home/Orders/You.

import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useAuth } from '../context/AuthContext';
import { Loading } from '../components/ui';
import LoginScreen from '../screens/LoginScreen';
import SignupScreen from '../screens/SignupScreen';
import OnboardingScreen from '../screens/OnboardingScreen';
import ActivityScreen from '../screens/ActivityScreen';
import BuyerDashboardScreen from '../screens/buyer/HomeScreen';
import BriefScreen from '../screens/buyer/BriefScreen';
import SettleScreen from '../screens/buyer/SettleScreen';
import AuctionScreen from '../screens/buyer/AuctionScreen';
import ListingDetailScreen from '../screens/ListingDetailScreen';
import ProfileScreen from '../screens/ProfileScreen';
import FarmerHomeScreen from '../screens/farmer/HomeScreen';
import MyListingsScreen from '../screens/farmer/MyListingsScreen';
import IncomingBidsScreen from '../screens/farmer/IncomingBidsScreen';
import CreateListingScreen from '../screens/farmer/CreateListingScreen';
import EditProfileScreen from '../screens/farmer/EditProfileScreen';
import StorefrontHomeScreen from '../screens/StorefrontHomeScreen';
import RatesScreen from '../screens/RatesScreen';
import BuyerTabBar from './BuyerTabBar';
import FarmerTabBar from './FarmerTabBar';
import ConsumerTabBar from './ConsumerTabBar';
import type { BuyerTabParamList, ConsumerStackParamList, ConsumerTabParamList, FarmerStackParamList, FarmerTabParamList, GuestStackParamList, RootStackParamList } from './types';
import type { User } from '../api/types';

// --- Buyer ---
const Tab = createBottomTabNavigator<BuyerTabParamList>();
function BuyerTabs() {
  return (
    <Tab.Navigator
      screenOptions={{ headerShown: false }}
      tabBar={(props) => <BuyerTabBar {...props} />}
    >
      <Tab.Screen name="Home" component={StorefrontHomeScreen} options={{ title: 'Home' }} />
      <Tab.Screen name="Dashboard" component={BuyerDashboardScreen} options={{ title: 'Dashboard' }} />
      <Tab.Screen name="Agents" component={BriefScreen} options={{ title: 'Agents' }} />
      <Tab.Screen name="Contracts" component={SettleScreen} options={{ title: 'Contracts' }} />
      <Tab.Screen name="You" component={ProfileScreen} options={{ title: 'You' }} />
    </Tab.Navigator>
  );
}

const RootStack = createNativeStackNavigator<RootStackParamList>();
function BuyerNavigator() {
  return (
    <RootStack.Navigator screenOptions={{ headerShown: false }}>
      <RootStack.Screen name="Tabs" component={BuyerTabs} />
      <RootStack.Screen name="Auction" component={AuctionScreen} options={{ presentation: 'card', animation: 'slide_from_right' }} />
      <RootStack.Screen
        name="ListingDetail"
        component={ListingDetailScreen as React.ComponentType<any>}
        options={{ headerShown: true, title: 'Listing', presentation: 'card', animation: 'slide_from_right' }}
      />
      <RootStack.Screen
        name="Rates"
        component={RatesScreen}
        options={{ headerShown: true, title: "Today's mandi rates", presentation: 'card', animation: 'slide_from_right' }}
      />
      <RootStack.Screen
        name="Notifications"
        component={ActivityScreen}
        options={{ headerShown: true, title: 'Activity', animation: 'slide_from_right' }}
      />
    </RootStack.Navigator>
  );
}

// --- Farmer ---
const FarmerTab = createBottomTabNavigator<FarmerTabParamList>();
function FarmerTabs() {
  return (
    <FarmerTab.Navigator
      screenOptions={{ headerShown: false }}
      tabBar={(props) => <FarmerTabBar {...props} />}
    >
      <FarmerTab.Screen name="Home" component={StorefrontHomeScreen} options={{ title: 'Home' }} />
      <FarmerTab.Screen name="Listings" component={MyListingsScreen} options={{ title: 'My Crops' }} />
      <FarmerTab.Screen name="Bids" component={IncomingBidsScreen} options={{ title: 'Offers' }} />
      <FarmerTab.Screen name="Farm" component={FarmerHomeScreen} options={{ title: 'My Farm' }} />
      <FarmerTab.Screen name="You" component={ProfileScreen} options={{ title: 'You' }} />
    </FarmerTab.Navigator>
  );
}

const FarmerStack = createNativeStackNavigator<FarmerStackParamList>();
function FarmerNavigator() {
  return (
    <FarmerStack.Navigator screenOptions={{ headerShown: false }}>
      <FarmerStack.Screen name="FarmerTabs" component={FarmerTabs} />
      <FarmerStack.Screen name="CreateListing" component={CreateListingScreen} options={{ presentation: 'card', animation: 'slide_from_right' }} />
      <FarmerStack.Screen
        name="EditProfile"
        component={EditProfileScreen}
        options={{ headerShown: true, title: 'Edit profile', presentation: 'card', animation: 'slide_from_right' }}
      />
      <FarmerStack.Screen name="Contracts" component={SettleScreen} options={{ presentation: 'card', animation: 'slide_from_right' }} />
      <FarmerStack.Screen name="Helper" component={BriefScreen} options={{ presentation: 'card', animation: 'slide_from_right' }} />
      <FarmerStack.Screen
        name="ListingDetail"
        component={ListingDetailScreen as React.ComponentType<any>}
        options={{ headerShown: true, title: 'Listing', presentation: 'card', animation: 'slide_from_right' }}
      />
      <FarmerStack.Screen
        name="Rates"
        component={RatesScreen}
        options={{ headerShown: true, title: "Today's mandi rates", presentation: 'card', animation: 'slide_from_right' }}
      />
      <FarmerStack.Screen
        name="Notifications"
        component={ActivityScreen}
        options={{ headerShown: true, title: 'Activity', animation: 'slide_from_right' }}
      />
    </FarmerStack.Navigator>
  );
}

// --- Consumer ---
const ConsumerTab = createBottomTabNavigator<ConsumerTabParamList>();
function ConsumerTabs() {
  return (
    <ConsumerTab.Navigator
      screenOptions={{ headerShown: false }}
      tabBar={(props) => <ConsumerTabBar {...props} />}
    >
      <ConsumerTab.Screen name="Home" component={StorefrontHomeScreen} options={{ title: 'Home' }} />
      <ConsumerTab.Screen name="Orders" component={SettleScreen} options={{ title: 'Orders' }} />
      <ConsumerTab.Screen name="You" component={ProfileScreen} options={{ title: 'You' }} />
    </ConsumerTab.Navigator>
  );
}

const ConsumerStack = createNativeStackNavigator<ConsumerStackParamList>();
function ConsumerNavigator() {
  return (
    <ConsumerStack.Navigator screenOptions={{ headerShown: false }}>
      <ConsumerStack.Screen name="ConsumerTabs" component={ConsumerTabs} />
      <ConsumerStack.Screen
        name="ListingDetail"
        component={ListingDetailScreen as React.ComponentType<any>}
        options={{ headerShown: true, title: 'Listing', presentation: 'card', animation: 'slide_from_right' }}
      />
      <ConsumerStack.Screen
        name="Rates"
        component={RatesScreen}
        options={{ headerShown: true, title: "Today's mandi rates", presentation: 'card', animation: 'slide_from_right' }}
      />
      <ConsumerStack.Screen
        name="Notifications"
        component={ActivityScreen}
        options={{ headerShown: true, title: 'Activity', animation: 'slide_from_right' }}
      />
    </ConsumerStack.Navigator>
  );
}

// --- Guest (signed out) ---
// Show the market first; ask for an account only at the point of action.
const GuestStack = createNativeStackNavigator<GuestStackParamList>();
function GuestNavigator() {
  return (
    <GuestStack.Navigator screenOptions={{ headerShown: false }}>
      <GuestStack.Screen name="GuestHome" component={StorefrontHomeScreen} />
      <GuestStack.Screen
        name="ListingDetail"
        component={ListingDetailScreen as React.ComponentType<any>}
        options={{ headerShown: true, title: 'Listing', presentation: 'card', animation: 'slide_from_right' }}
      />
      <GuestStack.Screen
        name="Rates"
        component={RatesScreen}
        options={{ headerShown: true, title: "Today's mandi rates", presentation: 'card', animation: 'slide_from_right' }}
      />
      <GuestStack.Screen
        name="Login"
        component={LoginScreen}
        options={{ headerShown: true, title: 'Log in', presentation: 'card', animation: 'slide_from_bottom' }}
      />
      <GuestStack.Screen
        name="Signup"
        component={SignupScreen}
        options={{ headerShown: true, title: 'Create account', animation: 'slide_from_right' }}
      />
    </GuestStack.Navigator>
  );
}

// A signed-in user with no role profile yet must finish onboarding before the app.
function needsOnboarding(user: User): boolean {
  if (user.role === 'FARMER') return !user.farmerProfile;
  if (user.role === 'BUYER') return !user.buyerProfile;
  return false; // consumers and admins have no onboarding step
}

export default function RootNavigator() {
  const { user, loading } = useAuth();
  if (loading) return <Loading />;
  return (
    <NavigationContainer>
      {!user ? (
        <GuestNavigator />
      ) : needsOnboarding(user) ? (
        <OnboardingScreen />
      ) : user.role === 'FARMER' ? (
        <FarmerNavigator />
      ) : user.role === 'CONSUMER' ? (
        <ConsumerNavigator />
      ) : (
        <BuyerNavigator />
      )}
    </NavigationContainer>
  );
}
