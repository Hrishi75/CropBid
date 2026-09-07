// React Navigation param-list types. Define the route names and the params each
// screen receives, giving navigation.navigate(...) and route.params full typing.

import type { BuyerRequirement, Listing } from '../api/types';

// Signed-out stack: email/password sign-in + account creation.
export type AuthStackParamList = {
  Login: undefined;
  Signup: undefined;
  ForgotPassword: undefined;
};

// Signed-out guest stack. The storefront is open to everyone — guests browse
// the full market and open listings freely; Login/Signup are pushed only when
// they try to act (buy, bid, sell, open the profile).
export type GuestStackParamList = {
  GuestHome: undefined;
  CropSellers: { crop: string; preview?: Listing[]; retailIn?: string };
  ListingDetail: { id: string; preview?: Listing };
  Rates: { tab?: 'rates' | 'forecast' } | undefined;
  Schemes: undefined;
  Equipment: undefined;
  Login: undefined;
  Signup: undefined;
  ForgotPassword: undefined;
};

export type BrowseStackParamList = {
  BrowseList: undefined;
  ListingDetail: { id: string; preview?: Listing };
};

export type TabParamList = {
  BrowseTab: undefined;
  Activity: undefined;
  Profile: undefined;
};

// Buyer-agent app. Home is the shared storefront; the KPI dashboard has its
// own tab.
export type BuyerTabParamList = {
  Home: undefined;
  Dashboard: undefined;
  Agents: undefined;
  Contracts: undefined;
  You: undefined;
};

export type RootStackParamList = {
  Tabs: undefined;
  Demand: undefined;
  RequirementDetail: { id: string; preview?: BuyerRequirement };
  MyRequirements: undefined;
  CreateRequirement: undefined;
  Auction: { listingId?: string } | undefined;
  CropSellers: { crop: string; preview?: Listing[]; retailIn?: string };
  ListingDetail: { id: string; preview?: Listing };
  Rates: { tab?: 'rates' | 'forecast' } | undefined;
  Schemes: undefined;
  Equipment: undefined;
  Notifications: undefined;
};

// Farmer app. Home is the shared storefront (the open market); the farm
// dashboard (KPIs, agent strip, quick actions) lives on the Farm tab. The AI
// helper is not a tab — it's pushed from the dashboard strip and Profile row.
export type FarmerTabParamList = {
  Home: undefined;
  Listings: undefined;
  Bids: undefined;
  Farm: undefined;
  You: undefined;
};

export type FarmerStackParamList = {
  FarmerTabs: undefined;
  Demand: undefined;
  RequirementDetail: { id: string; preview?: BuyerRequirement };
  MyOffers: undefined;
  CreateListing: { id?: string } | undefined;
  EditProfile: undefined;
  Contracts: undefined;
  Helper: undefined;
  CropSellers: { crop: string; preview?: Listing[]; retailIn?: string };
  ListingDetail: { id: string; preview?: Listing };
  Rates: { tab?: 'rates' | 'forecast' } | undefined;
  Schemes: undefined;
  Equipment: undefined;
  Notifications: undefined;
};

// Consumer app — buy any quantity directly from a farmer, no bidding. Cart is
// a tab rather than a floating button: it is the one surface a shopper returns
// to over and over, and a tab with a count badge is where a phone user looks
// for it. The sticky CartBar on the shelf is the shortcut, not the only door.
export type ConsumerTabParamList = {
  Home: undefined;
  Cart: undefined;
  Orders: undefined;
  You: undefined;
};

export type ConsumerStackParamList = {
  ConsumerTabs: undefined;
  Checkout: undefined;
  CropSellers: { crop: string; preview?: Listing[]; retailIn?: string };
  ListingDetail: { id: string; preview?: Listing };
  Rates: { tab?: 'rates' | 'forecast' } | undefined;
  Schemes: undefined;
  Equipment: undefined;
  Notifications: undefined;
};

// The demand board — the exchange run in reverse, where buyers post what they
// need and farmers answer. Mounted in BOTH role stacks, because both sides read
// the board: farmers to find work, buyers for the only view of procurement
// rates the platform gives them. Which routes each stack actually registers
// differs (a farmer has offers, a buyer has requirements), so this is the union
// and each stack takes its own slice.
export type DemandStackParamList = {
  Demand: undefined;
  // `preview` is the row the board already had, so the detail screen paints
  // before its own fetch lands.
  RequirementDetail: { id: string; preview?: BuyerRequirement };
  MyOffers: undefined;
  MyRequirements: undefined;
  CreateRequirement: undefined;
};

// Partner app — where a seller or buyer waits while their application is
// reviewed. Not a tab bar: there is one screen, plus the reference surfaces
// that stay open to everyone and the form they can be sent back to.
export type PartnerStackParamList = {
  PartnerStatus: undefined;
  Application: undefined;
  Rates: { tab?: 'rates' | 'forecast' } | undefined;
  Schemes: undefined;
  Equipment: undefined;
};

// ProfileScreen (the "You" tab) is mounted in the buyer, farmer, and consumer
// stacks, so its navigation targets span all three param lists. Role gates in
// the screen decide which rows — and therefore which routes — are reachable.
export type ProfileParamList = RootStackParamList &
  FarmerStackParamList &
  ConsumerStackParamList;
