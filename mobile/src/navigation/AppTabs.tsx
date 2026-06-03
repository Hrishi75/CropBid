import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text } from 'react-native';

import ActivityScreen from '../screens/ActivityScreen';
import BrowseScreen from '../screens/BrowseScreen';
import ProfileScreen from '../screens/ProfileScreen';
import { type AppTabsParamList } from './types';

const Tab = createBottomTabNavigator<AppTabsParamList>();

// Emoji glyph icons keep the tab bar dependency-free for now; swap for
// @expo/vector-icons later if a sharper icon set is wanted.
const tabIcon =
  (glyph: string) =>
  ({ focused }: { focused: boolean }) => (
    <Text style={{ fontSize: 18, opacity: focused ? 1 : 0.55 }}>{glyph}</Text>
  );

export default function AppTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        tabBarActiveTintColor: '#1f2d18',
        tabBarInactiveTintColor: '#82806f',
        headerStyle: { backgroundColor: '#fbf9f3' },
        headerTitleStyle: { color: '#14140f' },
      }}
    >
      <Tab.Screen name="Browse" component={BrowseScreen} options={{ tabBarIcon: tabIcon('🌾') }} />
      <Tab.Screen
        name="Activity"
        component={ActivityScreen}
        options={{ tabBarIcon: tabIcon('📊') }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{ tabBarIcon: tabIcon('👤') }}
      />
    </Tab.Navigator>
  );
}
