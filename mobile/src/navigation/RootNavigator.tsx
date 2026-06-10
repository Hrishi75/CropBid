// Root navigation. Gates on auth state from AuthContext: shows a loader while
// restoring the session, the LoginScreen when signed out, and the buyer tab
// navigator (Home/Market/Brief/Settle/Auction + Profile) once signed in.

import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useAuth } from '../context/AuthContext';
import { Loading } from '../components/ui';
import LoginScreen from '../screens/LoginScreen';
import HomeScreen from '../screens/buyer/HomeScreen';
import MarketScreen from '../screens/buyer/MarketScreen';
import BriefScreen from '../screens/buyer/BriefScreen';
import SettleScreen from '../screens/buyer/SettleScreen';
import AuctionScreen from '../screens/buyer/AuctionScreen';
import ListingDetailScreen from '../screens/ListingDetailScreen';
import ProfileScreen from '../screens/ProfileScreen';
import BuyerTabBar from './BuyerTabBar';
import type { BuyerTabParamList, RootStackParamList } from './types';

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
function AppNavigator() {
  return (
    <RootStack.Navigator screenOptions={{ headerShown: false }}>
      <RootStack.Screen name="Tabs" component={BuyerTabs} />
      <RootStack.Screen name="Auction" component={AuctionScreen} options={{ presentation: 'card', animation: 'slide_from_right' }} />
      <RootStack.Screen
        name="ListingDetail"
        component={ListingDetailScreen as React.ComponentType<any>}
        options={{ headerShown: true, title: 'Listing', presentation: 'card', animation: 'slide_from_right' }}
      />
    </RootStack.Navigator>
  );
}

const AuthStack = createNativeStackNavigator();
function AuthNavigator() {
  return (
    <AuthStack.Navigator screenOptions={{ headerShown: false }}>
      <AuthStack.Screen name="Login" component={LoginScreen} />
    </AuthStack.Navigator>
  );
}

export default function RootNavigator() {
  const { user, loading } = useAuth();
  if (loading) return <Loading />;
  return (
    <NavigationContainer>{user ? <AppNavigator /> : <AuthNavigator />}</NavigationContainer>
  );
}
