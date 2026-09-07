// Root navigation. Gates on auth state from AuthContext: shows a loader while
// restoring the session, then — signed out — the GUEST storefront, not a login
// wall: guests land straight on StorefrontHomeScreen, browse the market and
// open listings, and only hit Login/Signup when they try to act (buy, bid,
// sell, profile). Once signed in, the tab navigator for the user's role.
// A signed-in seller or buyer whose partner application is still in review gets
// PartnerNavigator instead of their dashboard — the server refuses every gated
// route until it is approved, so offering the dashboard would only produce
// 403s. Every role's HOME tab is the shared StorefrontHomeScreen (the web homepage
// mirrored on mobile); the old farmer and buyer dashboards live on their own
// tabs (My Farm / Dashboard). Farmers get Home/My Crops/Offers/Farm/You (their
// AI helper is pushed from Profile), buyers get Home/Dashboard/Agents/
// Contracts/You + Auction in the stack, consumers (instant-buy any quantity,
// no bidding) get Home/Cart/Orders/You, with Checkout pushed over the tabs.
// The demand board (buyers post what they need, farmers answer) is pushed in
// both the farmer and the buyer stack rather than taking a tab in either — both
// bars are already full, and it is a place you go to, not a place you live.

import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { Loading } from '../components/ui';
import LoginScreen from '../screens/LoginScreen';
import SignupScreen from '../screens/SignupScreen';
import ForgotPasswordScreen from '../screens/ForgotPasswordScreen';
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
import CartScreen from '../screens/consumer/CartScreen';
import CheckoutScreen from '../screens/consumer/CheckoutScreen';
import PartnerStatusScreen from '../screens/partner/PartnerStatusScreen';
import DemandBoardScreen from '../screens/DemandBoardScreen';
import RequirementDetailScreen from '../screens/RequirementDetailScreen';
import MyOffersScreen from '../screens/farmer/MyOffersScreen';
import MyRequirementsScreen from '../screens/buyer/MyRequirementsScreen';
import CreateRequirementScreen from '../screens/buyer/CreateRequirementScreen';
import CropSellersScreen from '../screens/CropSellersScreen';
import MandiScreen from '../screens/MandiScreen';
import SchemesScreen from '../screens/SchemesScreen';
import EquipmentScreen from '../screens/EquipmentScreen';
import BuyerTabBar from './BuyerTabBar';
import FarmerTabBar from './FarmerTabBar';
import ConsumerTabBar from './ConsumerTabBar';
import type { BuyerTabParamList, ConsumerStackParamList, ConsumerTabParamList, FarmerStackParamList, FarmerTabParamList, GuestStackParamList, PartnerStackParamList, RootStackParamList } from './types';
import type { User } from '../api/types';
import { isPendingPartner } from '../lib/partner';

// --- Buyer ---
const Tab = createBottomTabNavigator<BuyerTabParamList>();
function BuyerTabs() {
  const { t } = useTranslation();
  return (
    <Tab.Navigator
      screenOptions={{ headerShown: false }}
      tabBar={(props) => <BuyerTabBar {...props} />}
    >
      <Tab.Screen name="Home" component={StorefrontHomeScreen} options={{ title: t('Home') }} />
      <Tab.Screen name="Dashboard" component={BuyerDashboardScreen} options={{ title: t('Dashboard') }} />
      <Tab.Screen name="Agents" component={BriefScreen} options={{ title: t('Agents') }} />
      <Tab.Screen name="Contracts" component={SettleScreen} options={{ title: t('Contracts') }} />
      <Tab.Screen name="You" component={ProfileScreen} options={{ title: t('You') }} />
    </Tab.Navigator>
  );
}

const RootStack = createNativeStackNavigator<RootStackParamList>();
function BuyerNavigator() {
  const { t } = useTranslation();
  return (
    <RootStack.Navigator screenOptions={{ headerShown: false }}>
      <RootStack.Screen name="Tabs" component={BuyerTabs} />
      <RootStack.Screen name="Auction" component={AuctionScreen} options={{ presentation: 'card', animation: 'slide_from_right' }} />
      {/* The demand board. A buyer reads it — it is the only view of what the
          rest of the market is paying — but cannot answer it: the fill and
          counter routes are farmer-only on the server. */}
      <RootStack.Screen name="Demand" component={DemandBoardScreen} options={{ animation: 'slide_from_right' }} />
      <RootStack.Screen
        name="RequirementDetail"
        component={RequirementDetailScreen as React.ComponentType<any>}
        options={{ headerShown: true, title: t('Requirement'), animation: 'slide_from_right' }}
      />
      <RootStack.Screen name="MyRequirements" component={MyRequirementsScreen} options={{ animation: 'slide_from_right' }} />
      <RootStack.Screen
        name="CreateRequirement"
        component={CreateRequirementScreen}
        options={{ headerShown: true, title: t('Post a requirement'), animation: 'slide_from_right' }}
      />
      <RootStack.Screen
        name="CropSellers"
        component={CropSellersScreen as React.ComponentType<any>}
        options={{ headerShown: true, presentation: 'card', animation: 'slide_from_right' }}
      />
      <RootStack.Screen
        name="ListingDetail"
        component={ListingDetailScreen as React.ComponentType<any>}
        options={{ headerShown: true, title: t('Listing'), presentation: 'card', animation: 'slide_from_right' }}
      />
      <RootStack.Screen
        name="Rates"
        component={MandiScreen}
        options={{ headerShown: true, title: t("Today's mandi rates"), presentation: 'card', animation: 'slide_from_right' }}
      />
      <RootStack.Screen
        name="Schemes"
        component={SchemesScreen}
        options={{ headerShown: true, title: t('Sarkari Yojana'), presentation: 'card', animation: 'slide_from_right' }}
      />
      <RootStack.Screen
        name="Equipment"
        component={EquipmentScreen}
        options={{ headerShown: true, title: t('Machines & equipment'), presentation: 'card', animation: 'slide_from_right' }}
      />
      <RootStack.Screen
        name="Notifications"
        component={ActivityScreen}
        options={{ headerShown: true, title: t('Activity'), animation: 'slide_from_right' }}
      />
    </RootStack.Navigator>
  );
}

// --- Farmer ---
const FarmerTab = createBottomTabNavigator<FarmerTabParamList>();
function FarmerTabs() {
  const { t } = useTranslation();
  return (
    <FarmerTab.Navigator
      screenOptions={{ headerShown: false }}
      tabBar={(props) => <FarmerTabBar {...props} />}
    >
      <FarmerTab.Screen name="Home" component={StorefrontHomeScreen} options={{ title: t('Home') }} />
      <FarmerTab.Screen name="Listings" component={MyListingsScreen} options={{ title: t('My Crops') }} />
      <FarmerTab.Screen name="Bids" component={IncomingBidsScreen} options={{ title: t('Offers') }} />
      <FarmerTab.Screen name="Farm" component={FarmerHomeScreen} options={{ title: t('My Farm') }} />
      <FarmerTab.Screen name="You" component={ProfileScreen} options={{ title: t('You') }} />
    </FarmerTab.Navigator>
  );
}

const FarmerStack = createNativeStackNavigator<FarmerStackParamList>();
function FarmerNavigator() {
  const { t } = useTranslation();
  return (
    <FarmerStack.Navigator screenOptions={{ headerShown: false }}>
      <FarmerStack.Screen name="FarmerTabs" component={FarmerTabs} />
      <FarmerStack.Screen name="CreateListing" component={CreateListingScreen} options={{ presentation: 'card', animation: 'slide_from_right' }} />
      <FarmerStack.Screen
        name="EditProfile"
        component={EditProfileScreen}
        options={{ headerShown: true, title: t('Edit profile'), presentation: 'card', animation: 'slide_from_right' }}
      />
      <FarmerStack.Screen name="Contracts" component={SettleScreen} options={{ presentation: 'card', animation: 'slide_from_right' }} />
      {/* Work to win: what buyers are asking for, and what this farmer has
          already offered against it. */}
      <FarmerStack.Screen name="Demand" component={DemandBoardScreen} options={{ animation: 'slide_from_right' }} />
      <FarmerStack.Screen
        name="RequirementDetail"
        component={RequirementDetailScreen as React.ComponentType<any>}
        options={{ headerShown: true, title: t('Requirement'), animation: 'slide_from_right' }}
      />
      <FarmerStack.Screen name="MyOffers" component={MyOffersScreen} options={{ animation: 'slide_from_right' }} />
      <FarmerStack.Screen name="Helper" component={BriefScreen} options={{ presentation: 'card', animation: 'slide_from_right' }} />
      <FarmerStack.Screen
        name="CropSellers"
        component={CropSellersScreen as React.ComponentType<any>}
        options={{ headerShown: true, presentation: 'card', animation: 'slide_from_right' }}
      />
      <FarmerStack.Screen
        name="ListingDetail"
        component={ListingDetailScreen as React.ComponentType<any>}
        options={{ headerShown: true, title: t('Listing'), presentation: 'card', animation: 'slide_from_right' }}
      />
      <FarmerStack.Screen
        name="Rates"
        component={MandiScreen}
        options={{ headerShown: true, title: t("Today's mandi rates"), presentation: 'card', animation: 'slide_from_right' }}
      />
      <FarmerStack.Screen
        name="Schemes"
        component={SchemesScreen}
        options={{ headerShown: true, title: t('Sarkari Yojana'), presentation: 'card', animation: 'slide_from_right' }}
      />
      <FarmerStack.Screen
        name="Equipment"
        component={EquipmentScreen}
        options={{ headerShown: true, title: t('Machines & equipment'), presentation: 'card', animation: 'slide_from_right' }}
      />
      <FarmerStack.Screen
        name="Notifications"
        component={ActivityScreen}
        options={{ headerShown: true, title: t('Activity'), animation: 'slide_from_right' }}
      />
    </FarmerStack.Navigator>
  );
}

// --- Consumer ---
const ConsumerTab = createBottomTabNavigator<ConsumerTabParamList>();
function ConsumerTabs() {
  const { t } = useTranslation();
  return (
    <ConsumerTab.Navigator
      screenOptions={{ headerShown: false }}
      tabBar={(props) => <ConsumerTabBar {...props} />}
    >
      <ConsumerTab.Screen name="Home" component={StorefrontHomeScreen} options={{ title: t('Home') }} />
      <ConsumerTab.Screen name="Cart" component={CartScreen} options={{ title: t('Cart') }} />
      <ConsumerTab.Screen name="Orders" component={SettleScreen} options={{ title: t('Orders') }} />
      <ConsumerTab.Screen name="You" component={ProfileScreen} options={{ title: t('You') }} />
    </ConsumerTab.Navigator>
  );
}

const ConsumerStack = createNativeStackNavigator<ConsumerStackParamList>();
function ConsumerNavigator() {
  const { t } = useTranslation();
  return (
    <ConsumerStack.Navigator screenOptions={{ headerShown: false }}>
      <ConsumerStack.Screen name="ConsumerTabs" component={ConsumerTabs} />
      {/* Pushed over the tabs, not a tab of its own: checkout is a one-way
          errand the shopper finishes or backs out of, and leaving the tab bar
          under it would invite them to wander off mid-address. */}
      <ConsumerStack.Screen
        name="Checkout"
        component={CheckoutScreen}
        options={{ headerShown: true, title: t('Checkout'), presentation: 'card', animation: 'slide_from_right' }}
      />
      <ConsumerStack.Screen
        name="CropSellers"
        component={CropSellersScreen as React.ComponentType<any>}
        options={{ headerShown: true, presentation: 'card', animation: 'slide_from_right' }}
      />
      <ConsumerStack.Screen
        name="ListingDetail"
        component={ListingDetailScreen as React.ComponentType<any>}
        options={{ headerShown: true, title: t('Listing'), presentation: 'card', animation: 'slide_from_right' }}
      />
      <ConsumerStack.Screen
        name="Rates"
        component={MandiScreen}
        options={{ headerShown: true, title: t("Today's mandi rates"), presentation: 'card', animation: 'slide_from_right' }}
      />
      <ConsumerStack.Screen
        name="Schemes"
        component={SchemesScreen}
        options={{ headerShown: true, title: t('Sarkari Yojana'), presentation: 'card', animation: 'slide_from_right' }}
      />
      <ConsumerStack.Screen
        name="Equipment"
        component={EquipmentScreen}
        options={{ headerShown: true, title: t('Machines & equipment'), presentation: 'card', animation: 'slide_from_right' }}
      />
      <ConsumerStack.Screen
        name="Notifications"
        component={ActivityScreen}
        options={{ headerShown: true, title: t('Activity'), animation: 'slide_from_right' }}
      />
    </ConsumerStack.Navigator>
  );
}

// --- Partner under review (applied, not yet approved) ---
// Selling and bulk buying are applied for, and the server refuses every gated
// route until an admin approves the application. So an unapproved partner does
// not get their dashboard: they get the status screen, plus the reference
// surfaces that are open to everyone anyway — rates, schemes, equipment — and
// the form, if a reviewer sent them back for more.
const PartnerStack = createNativeStackNavigator<PartnerStackParamList>();
function PartnerNavigator() {
  const { t } = useTranslation();
  return (
    <PartnerStack.Navigator screenOptions={{ headerShown: false }}>
      <PartnerStack.Screen name="PartnerStatus" component={PartnerStatusScreen} />
      <PartnerStack.Screen
        name="Application"
        component={OnboardingScreen}
        options={{ headerShown: true, title: t('Your application'), presentation: 'card', animation: 'slide_from_right' }}
      />
      <PartnerStack.Screen
        name="Rates"
        component={MandiScreen}
        options={{ headerShown: true, title: t("Today's mandi rates"), presentation: 'card', animation: 'slide_from_right' }}
      />
      <PartnerStack.Screen
        name="Schemes"
        component={SchemesScreen}
        options={{ headerShown: true, title: t('Sarkari Yojana'), presentation: 'card', animation: 'slide_from_right' }}
      />
      <PartnerStack.Screen
        name="Equipment"
        component={EquipmentScreen}
        options={{ headerShown: true, title: t('Machines & equipment'), presentation: 'card', animation: 'slide_from_right' }}
      />
    </PartnerStack.Navigator>
  );
}

// --- Guest (signed out) ---
// Show the market first; ask for an account only at the point of action.
const GuestStack = createNativeStackNavigator<GuestStackParamList>();
function GuestNavigator() {
  const { t } = useTranslation();
  return (
    <GuestStack.Navigator screenOptions={{ headerShown: false }}>
      <GuestStack.Screen name="GuestHome" component={StorefrontHomeScreen} />
      <GuestStack.Screen
        name="CropSellers"
        component={CropSellersScreen as React.ComponentType<any>}
        options={{ headerShown: true, presentation: 'card', animation: 'slide_from_right' }}
      />
      <GuestStack.Screen
        name="ListingDetail"
        component={ListingDetailScreen as React.ComponentType<any>}
        options={{ headerShown: true, title: t('Listing'), presentation: 'card', animation: 'slide_from_right' }}
      />
      <GuestStack.Screen
        name="Rates"
        component={MandiScreen}
        options={{ headerShown: true, title: t("Today's mandi rates"), presentation: 'card', animation: 'slide_from_right' }}
      />
      <GuestStack.Screen
        name="Schemes"
        component={SchemesScreen}
        options={{ headerShown: true, title: t('Sarkari Yojana'), presentation: 'card', animation: 'slide_from_right' }}
      />
      <GuestStack.Screen
        name="Equipment"
        component={EquipmentScreen}
        options={{ headerShown: true, title: t('Machines & equipment'), presentation: 'card', animation: 'slide_from_right' }}
      />
      <GuestStack.Screen
        name="Login"
        component={LoginScreen}
        options={{ headerShown: true, title: t('Log in'), presentation: 'card', animation: 'slide_from_bottom' }}
      />
      <GuestStack.Screen
        name="Signup"
        component={SignupScreen}
        options={{ headerShown: true, title: t('Create account'), animation: 'slide_from_right' }}
      />
      <GuestStack.Screen
        name="ForgotPassword"
        component={ForgotPasswordScreen}
        options={{ headerShown: true, title: t('Reset password'), animation: 'slide_from_right' }}
      />
    </GuestStack.Navigator>
  );
}

// A signed-in seller or buyer with no application on file has to write one
// before anything else. Consumers and admins never apply — they shop and
// administer from the moment they sign in.
function needsApplication(user: User): boolean {
  if (user.role === 'FARMER') return !user.farmerProfile;
  if (user.role === 'BUYER') return !user.buyerProfile;
  return false;
}

export default function RootNavigator() {
  const { user, loading } = useAuth();
  if (loading) return <Loading />;
  return (
    <NavigationContainer>
      {!user ? (
        <GuestNavigator />
      ) : needsApplication(user) ? (
        <OnboardingScreen />
      ) : isPendingPartner(user) ? (
        /* Applied, not approved. The dashboard behind this would 403 on every
           action, so it is not offered until a reviewer says yes. */
        <PartnerNavigator />
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
