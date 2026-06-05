import React from 'react';
import { Text } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useAuth } from '../context/AuthContext';
import { Loading } from '../components/ui';
import LoginScreen from '../screens/LoginScreen';
import BrowseScreen from '../screens/BrowseScreen';
import ListingDetailScreen from '../screens/ListingDetailScreen';
import ActivityScreen from '../screens/ActivityScreen';
import ProfileScreen from '../screens/ProfileScreen';
import type { BrowseStackParamList, TabParamList } from './types';
import { colors } from '../theme';

const headerStyle = {
  headerStyle: { backgroundColor: colors.forest },
  headerTintColor: colors.textInverse,
  headerTitleStyle: { fontWeight: '700' as const },
};

const BrowseStack = createNativeStackNavigator<BrowseStackParamList>();
function BrowseNavigator() {
  return (
    <BrowseStack.Navigator screenOptions={headerStyle}>
      <BrowseStack.Screen
        name="BrowseList"
        component={BrowseScreen}
        options={{ title: 'Browse crops' }}
      />
      <BrowseStack.Screen
        name="ListingDetail"
        component={ListingDetailScreen}
        options={{ title: 'Listing' }}
      />
    </BrowseStack.Navigator>
  );
}

const Tab = createBottomTabNavigator<TabParamList>();
function tabIcon(emoji: string) {
  return ({ color }: { color: string }) => (
    <Text style={{ fontSize: 18, color }}>{emoji}</Text>
  );
}

function AppTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        ...headerStyle,
        tabBarActiveTintColor: colors.forest,
        tabBarInactiveTintColor: colors.textMuted,
      }}
    >
      <Tab.Screen
        name="BrowseTab"
        component={BrowseNavigator}
        options={{ title: 'Browse', headerShown: false, tabBarIcon: tabIcon('🌾') }}
      />
      <Tab.Screen
        name="Activity"
        component={ActivityScreen}
        options={{ title: 'Activity', tabBarIcon: tabIcon('📊') }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{ title: 'Profile', tabBarIcon: tabIcon('👤') }}
      />
    </Tab.Navigator>
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
    <NavigationContainer>{user ? <AppTabs /> : <AuthNavigator />}</NavigationContainer>
  );
}
