// Custom bottom tab bar for the seller app: the shared floating pill, with the
// seller's tabs mapped to their icons. The labels themselves come from the
// navigator, which takes them from lib/sellerType, so a shop sees "My Stock"
// and "My Shop" where a farm sees "My Crops" and "My Farm".
//
// The home tab is a sprout, not the bolt it used to be. IconBolt draws in a
// fixed fill and ignores the colour it is handed, which on the pill's filled
// active tab would put a black bolt on dark green.
import React from 'react';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { IconBell, IconDoc, IconHome, IconSprout, IconUser, IcoProps } from '../components/icons';
import { FloatingTabBar } from './FloatingTabBar';

const ICONS: Record<string, React.ComponentType<IcoProps>> = {
  Home: IconHome,
  Listings: IconDoc,
  Bids: IconBell,
  Farm: IconSprout,
  You: IconUser,
};

export default function FarmerTabBar(props: BottomTabBarProps) {
  return <FloatingTabBar {...props} icons={ICONS} />;
}
