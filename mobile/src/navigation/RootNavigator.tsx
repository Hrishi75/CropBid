// Root navigation. Gates on auth state from AuthContext: shows a loader while
// restoring the session, the LoginScreen when signed out, and — once signed in —
// the tab navigator for the user's role: farmers get Home/Listings/Bids/Agent/You,
// buyers get Home/Market/Agents/Contracts/Auction + Profile.

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
import HomeScreen from '../screens/buyer/HomeScreen';
import MarketScreen from '../screens/buyer/MarketScreen';
import BriefScreen from '../screens/buyer/BriefScreen';
import SettleScreen from '../screens/buyer/SettleScreen';
import AuctionScreen from '../screens/buyer/AuctionScreen';
import ListingDetailScreen from '../screens/ListingDetailScreen';
import ProfileScreen from '../screens/ProfileScreen';
import FarmerHomeScreen from '../screens/farmer/HomeScreen';
import MyListingsScreen from '../screens/farmer/MyListingsScreen';
import IncomingBidsScreen from '../screens/farmer/IncomingBidsScreen';
import CreateListingScreen from '../screens/farmer/CreateListingScreen';
import BuyerTabBar from './BuyerTabBar';
import FarmerTabBar from './FarmerTabBar';
import type { AuthStackParamList, BuyerTabParamList, FarmerStackParamList, FarmerTabParamList, RootStackParamList } from './types';
import type { User } from '../api/types';

// --- Buyer ---
const Tab = createBottomTabNavigator<BuyerTabParamList>();
function BuyerTabs() {
  return (
    <Tab.Navigator
      screenOptions={{ headerShown: false }}
      tabBar={(props) => <BuyerTabBar {...props} />}
    >
      <Tab.Screen name="Home" component={HomeScreen} options={{ title: 'Home' }} />
      <Tab.Screen name="Market" component={MarketScreen} options={{ title: 'Market' }} />
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
      <FarmerTab.Screen name="Home" component={FarmerHomeScreen} options={{ title: 'Home' }} />
      <FarmerTab.Screen name="Listings" component={MyListingsScreen} options={{ title: 'Listings' }} />
      <FarmerTab.Screen name="Bids" component={IncomingBidsScreen} options={{ title: 'Bids' }} />
      <FarmerTab.Screen name="Agent" component={BriefScreen} options={{ title: 'Agent' }} />
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
      <FarmerStack.Screen name="Contracts" component={SettleScreen} options={{ presentation: 'card', animation: 'slide_from_right' }} />
      <FarmerStack.Screen
        name="Notifications"
        component={ActivityScreen}
        options={{ headerShown: true, title: 'Activity', animation: 'slide_from_right' }}
      />
    </FarmerStack.Navigator>
  );
}

const AuthStack = createNativeStackNavigator<AuthStackParamList>();
function AuthNavigator() {
  return (
    <AuthStack.Navigator screenOptions={{ headerShown: false }}>
      <AuthStack.Screen name="Login" component={LoginScreen} />
      <AuthStack.Screen name="Signup" component={SignupScreen} options={{ animation: 'slide_from_right' }} />
    </AuthStack.Navigator>
  );
}

// A signed-in user with no role profile yet must finish onboarding before the app.
function needsOnboarding(user: User): boolean {
  if (user.role === 'FARMER') return !user.farmerProfile;
  if (user.role === 'BUYER') return !user.buyerProfile;
  return false; // admins have no onboarding step
}

export default function RootNavigator() {
  const { user, loading } = useAuth();
  if (loading) return <Loading />;
  return (
    <NavigationContainer>
      {!user ? (
        <AuthNavigator />
      ) : needsOnboarding(user) ? (
        <OnboardingScreen />
      ) : user.role === 'FARMER' ? (
        <FarmerNavigator />
      ) : (
        <BuyerNavigator />
      )}
    </NavigationContainer>
  );
}
