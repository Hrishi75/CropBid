// Custom bottom tab bar for the buyer app: the shared floating pill, with the
// buyer's tabs mapped to their icons.
//
// The dashboard is a market chart, not the bolt it used to be. IconBolt draws
// in a fixed fill and ignores the colour it is handed, which on the pill's
// filled active tab would put a black bolt on dark green.
import React from 'react';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { IconDoc, IconHome, IconMarket, IconShare, IconUser, IcoProps } from '../components/icons';
import { FloatingTabBar } from './FloatingTabBar';

const ICONS: Record<string, React.ComponentType<IcoProps>> = {
  Home: IconHome,
  Dashboard: IconMarket,
  Requests: IconShare,
  Contracts: IconDoc,
  You: IconUser,
};

export default function BuyerTabBar(props: BottomTabBarProps) {
  return <FloatingTabBar {...props} icons={ICONS} />;
}
