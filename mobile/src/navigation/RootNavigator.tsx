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
import WalletScreen from '../screens/WalletScreen';
import FarmerHomeScreen from '../screens/farmer/HomeScreen';
import MyListingsScreen from '../screens/farmer/MyListingsScreen';
import IncomingBidsScreen from '../screens/farmer/IncomingBidsScreen';
import CreateListingScreen from '../screens/farmer/CreateListingScreen';
import EditProfileScreen from '../screens/farmer/EditProfileScreen';
import StorefrontHomeScreen from '../screens/StorefrontHomeScreen';
import ShopScreen from '../screens/ShopScreen';
import CartScreen from '../screens/consumer/CartScreen';
import OrdersScreen from '../screens/consumer/OrdersScreen';
import CheckoutScreen from '../screens/consumer/CheckoutScreen';
import PartnerStatusScreen from '../screens/partner/PartnerStatusScreen';
import JoinScreen from '../screens/partner/JoinScreen';
import AddressBookScreen from '../screens/profile/AddressBookScreen';
import HelpScreen from '../screens/profile/HelpScreen';
import AboutScreen from '../screens/profile/AboutScreen';
import NotificationPrefsScreen from '../screens/profile/NotificationPrefsScreen';
import PolicyScreen from '../screens/profile/PolicyScreen';
import DemandBoardScreen from '../screens/DemandBoardScreen';
import RequirementDetailScreen from '../screens/RequirementDetailScreen';
import MyOffersScreen from '../screens/farmer/MyOffersScreen';
import MyRequirementsScreen from '../screens/buyer/MyRequirementsScreen';
import CreateRequirementScreen from '../screens/buyer/CreateRequirementScreen';
import CropSellersScreen from '../screens/CropSellersScreen';
import MandiScreen from '../screens/MandiScreen';
import SchemesScreen from '../screens/SchemesScreen';
import BuyerTabBar from './BuyerTabBar';
import FarmerTabBar from './FarmerTabBar';
import ConsumerTabBar from './ConsumerTabBar';
import type { BuyerTabParamList, ConsumerStackParamList, ConsumerTabParamList, FarmerStackParamList, FarmerTabParamList, GuestStackParamList, PartnerStackParamList, RootStackParamList } from './types';
import type { User } from '../api/types';
import { isPendingPartner } from '../lib/partner';
import { sellerWords } from '../lib/sellerType';

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
      {/* Help, about and the policies. Registered on every stack: they are
          the pages anyone might need whatever they are, and a route that
          exists for shoppers only crashes when a farmer taps the same row. */}
      <RootStack.Screen
        name="Help"
        component={HelpScreen}
        options={{ headerShown: true, title: t('Help'), animation: 'slide_from_right' }}
      />
      <RootStack.Screen
        name="About"
        component={AboutScreen}
        options={{ headerShown: true, title: t('About CropBid'), animation: 'slide_from_right' }}
      />
      <RootStack.Screen
        name="Policy"
        component={PolicyScreen as React.ComponentType<any>}
        options={({ route }: any) => ({
          headerShown: true,
          title: route.params?.kind === 'terms'
            ? t('Terms and conditions')
            : route.params?.kind === 'privacy' ? t('Privacy policy') : t('Common questions'),
          animation: 'slide_from_right',
        })}
      />
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
        options={{ headerShown: true, title: t('Mandi rates'), presentation: 'card', animation: 'slide_from_right' }}
      />
      <RootStack.Screen
        name="Wallet"
        component={WalletScreen}
        options={{ headerShown: true, title: t('Wallet'), presentation: 'card', animation: 'slide_from_right' }}
      />
      <RootStack.Screen
        name="Schemes"
        component={SchemesScreen}
        options={{ headerShown: true, title: t('Sarkari Yojana'), presentation: 'card', animation: 'slide_from_right' }}
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
  // A kirana store's tabs should not say "My Crops" and "My Farm". The labels
  // come off sellerType, which the server has always sent. See lib/sellerType.
  const words = sellerWords(useAuth().user);
  return (
    <FarmerTab.Navigator
      screenOptions={{ headerShown: false }}
      tabBar={(props) => <FarmerTabBar {...props} />}
    >
      <FarmerTab.Screen name="Home" component={StorefrontHomeScreen} options={{ title: t('Home') }} />
      <FarmerTab.Screen name="Listings" component={MyListingsScreen} options={{ title: t(words.stockTab) }} />
      <FarmerTab.Screen name="Bids" component={IncomingBidsScreen} options={{ title: t('Offers') }} />
      <FarmerTab.Screen name="Farm" component={FarmerHomeScreen} options={{ title: t(words.homeTab) }} />
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
      {/* Help, about and the policies. Registered on every stack: they are
          the pages anyone might need whatever they are, and a route that
          exists for shoppers only crashes when a farmer taps the same row. */}
      <FarmerStack.Screen
        name="Help"
        component={HelpScreen}
        options={{ headerShown: true, title: t('Help'), animation: 'slide_from_right' }}
      />
      <FarmerStack.Screen
        name="About"
        component={AboutScreen}
        options={{ headerShown: true, title: t('About CropBid'), animation: 'slide_from_right' }}
      />
      <FarmerStack.Screen
        name="Policy"
        component={PolicyScreen as React.ComponentType<any>}
        options={({ route }: any) => ({
          headerShown: true,
          title: route.params?.kind === 'terms'
            ? t('Terms and conditions')
            : route.params?.kind === 'privacy' ? t('Privacy policy') : t('Common questions'),
          animation: 'slide_from_right',
        })}
      />
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
        options={{ headerShown: true, title: t('Mandi rates'), presentation: 'card', animation: 'slide_from_right' }}
      />
      <FarmerStack.Screen
        name="Wallet"
        component={WalletScreen}
        options={{ headerShown: true, title: t('Wallet'), presentation: 'card', animation: 'slide_from_right' }}
      />
      <FarmerStack.Screen
        name="Schemes"
        component={SchemesScreen}
        options={{ headerShown: true, title: t('Sarkari Yojana'), presentation: 'card', animation: 'slide_from_right' }}
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
      <ConsumerTab.Screen name="Partner" component={JoinScreen} options={{ title: t('Partner') }} />
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
      {/* One local shop's counter. Pushed over the tabs rather than taking one:
          a shopper goes to a shop and comes back, they do not live in it. */}
      <ConsumerStack.Screen
        name="Shop"
        component={ShopScreen}
        options={{ animation: 'slide_from_right' }}
      />
      {/* A shopper's own order history, NOT buyer/SettleScreen. That screen is a
          B2B escrow record ("Contracts", contract terms, per-quintal bid
          quantities) and a household buying two kilos of tomatoes was being
          shown a commodity settlement.

          Reached from Profile rather than the tab bar: a history is checked now
          and then, and the slot is better spent on what a shopper switches to
          many times a session. */}
      <ConsumerStack.Screen
        name="Orders"
        component={OrdersScreen}
        options={{ headerShown: true, title: t('Your orders'), animation: 'slide_from_right' }}
      />

      {/* Profile's settings surfaces. All pushed with a header, because each is
          a place you go, read, and come back from. */}
      <ConsumerStack.Screen
        name="AddressBook"
        component={AddressBookScreen}
        options={{ headerShown: true, title: t('Delivery addresses'), animation: 'slide_from_right' }}
      />
      <ConsumerStack.Screen
        name="Help"
        component={HelpScreen}
        options={{ headerShown: true, title: t('Help'), animation: 'slide_from_right' }}
      />
      <ConsumerStack.Screen
        name="About"
        component={AboutScreen}
        options={{ headerShown: true, title: t('About CropBid'), animation: 'slide_from_right' }}
      />
      <ConsumerStack.Screen
        name="NotificationPrefs"
        component={NotificationPrefsScreen}
        options={{ headerShown: true, title: t('Notifications'), animation: 'slide_from_right' }}
      />
      <ConsumerStack.Screen
        name="Policy"
        component={PolicyScreen as React.ComponentType<any>}
        options={({ route }: any) => ({
          headerShown: true,
          title: route.params?.kind === 'terms'
            ? t('Terms and conditions')
            : route.params?.kind === 'privacy' ? t('Privacy policy') : t('Common questions'),
          animation: 'slide_from_right',
        })}
      />
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
        options={{ headerShown: true, title: t('Mandi rates'), presentation: 'card', animation: 'slide_from_right' }}
      />
      <ConsumerStack.Screen
        name="Wallet"
        component={WalletScreen}
        options={{ headerShown: true, title: t('Wallet'), presentation: 'card', animation: 'slide_from_right' }}
      />
      <ConsumerStack.Screen
        name="Schemes"
        component={SchemesScreen}
        options={{ headerShown: true, title: t('Sarkari Yojana'), presentation: 'card', animation: 'slide_from_right' }}
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
// surfaces that are open to everyone anyway, rates and schemes, and
// the form, if a reviewer sent them back for more.
const PartnerStack = createNativeStackNavigator<PartnerStackParamList>();
function PartnerNavigator() {
  const { t } = useTranslation();
  return (
    <PartnerStack.Navigator screenOptions={{ headerShown: false }}>
      <PartnerStack.Screen name="PartnerStatus" component={PartnerStatusScreen} />
      {/* Help, about and the policies. Registered on every stack: they are
          the pages anyone might need whatever they are, and a route that
          exists for shoppers only crashes when a farmer taps the same row. */}
      <PartnerStack.Screen
        name="Help"
        component={HelpScreen}
        options={{ headerShown: true, title: t('Help'), animation: 'slide_from_right' }}
      />
      <PartnerStack.Screen
        name="About"
        component={AboutScreen}
        options={{ headerShown: true, title: t('About CropBid'), animation: 'slide_from_right' }}
      />
      <PartnerStack.Screen
        name="Policy"
        component={PolicyScreen as React.ComponentType<any>}
        options={({ route }: any) => ({
          headerShown: true,
          title: route.params?.kind === 'terms'
            ? t('Terms and conditions')
            : route.params?.kind === 'privacy' ? t('Privacy policy') : t('Common questions'),
          animation: 'slide_from_right',
        })}
      />
      <PartnerStack.Screen
        name="Application"
        component={OnboardingScreen}
        options={{ headerShown: true, title: t('Your application'), presentation: 'card', animation: 'slide_from_right' }}
      />
      <PartnerStack.Screen
        name="Rates"
        component={MandiScreen}
        options={{ headerShown: true, title: t('Mandi rates'), presentation: 'card', animation: 'slide_from_right' }}
      />
      <PartnerStack.Screen
        name="Wallet"
        component={WalletScreen}
        options={{ headerShown: true, title: t('Wallet'), presentation: 'card', animation: 'slide_from_right' }}
      />
      <PartnerStack.Screen
        name="Schemes"
        component={SchemesScreen}
        options={{ headerShown: true, title: t('Sarkari Yojana'), presentation: 'card', animation: 'slide_from_right' }}
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
      {/* Open to guests: the shelf is public and the gate is at the basket, not
          the window. ShelfCard renders the ADD button only for a signed-in
          CONSUMER, so there is nothing here a stranger can act on. */}
      <GuestStack.Screen
        name="Shop"
        component={ShopScreen}
        options={{ animation: 'slide_from_right' }}
      />
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
        options={{ headerShown: true, title: t('Mandi rates'), presentation: 'card', animation: 'slide_from_right' }}
      />
      <GuestStack.Screen
        name="Wallet"
        component={WalletScreen}
        options={{ headerShown: true, title: t('Wallet'), presentation: 'card', animation: 'slide_from_right' }}
      />
      <GuestStack.Screen
        name="Schemes"
        component={SchemesScreen}
        options={{ headerShown: true, title: t('Sarkari Yojana'), presentation: 'card', animation: 'slide_from_right' }}
      />
      {/* Help, about and the policies. Registered on every stack: they are
          the pages anyone might need whatever they are, and a route that
          exists for shoppers only crashes when a farmer taps the same row. */}
      <GuestStack.Screen
        name="Help"
        component={HelpScreen}
        options={{ headerShown: true, title: t('Help'), animation: 'slide_from_right' }}
      />
      <GuestStack.Screen
        name="About"
        component={AboutScreen}
        options={{ headerShown: true, title: t('About CropBid'), animation: 'slide_from_right' }}
      />
      <GuestStack.Screen
        name="Policy"
        component={PolicyScreen as React.ComponentType<any>}
        options={({ route }: any) => ({
          headerShown: true,
          title: route.params?.kind === 'terms'
            ? t('Terms and conditions')
            : route.params?.kind === 'privacy' ? t('Privacy policy') : t('Common questions'),
          animation: 'slide_from_right',
        })}
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
