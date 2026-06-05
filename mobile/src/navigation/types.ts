import type { Listing } from '../api/types';

export type BrowseStackParamList = {
  BrowseList: undefined;
  ListingDetail: { id: string; preview?: Listing };
};

export type TabParamList = {
  BrowseTab: undefined;
  Activity: undefined;
  Profile: undefined;
};
