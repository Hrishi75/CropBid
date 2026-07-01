// React Navigation param-list types. Define the route names and the params each
// screen receives, giving navigation.navigate(...) and route.params full typing.

import type { Listing } from '../api/types';

// Signed-out stack: email/password sign-in + account creation.
export type AuthStackParamList = {
  Login: undefined;
  Signup: undefined;
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

// Buyer-agent app (iOS design screens)
export type BuyerTabParamList = {
  Home: undefined;
  Market: undefined;
  Agents: undefined;
  Contracts: undefined;
  You: undefined;
};

export type RootStackParamList = {
  Tabs: undefined;
  Auction: { listingId?: string } | undefined;
  ListingDetail: { id: string; preview?: Listing };
  Notifications: undefined;
};

// Farmer app
export type FarmerTabParamList = {
  Home: undefined;
  Listings: undefined;
  Bids: undefined;
  Agent: undefined;
  You: undefined;
};

export type FarmerStackParamList = {
  FarmerTabs: undefined;
  CreateListing: { id?: string } | undefined;
  EditProfile: undefined;
  Contracts: undefined;
  Notifications: undefined;
};
