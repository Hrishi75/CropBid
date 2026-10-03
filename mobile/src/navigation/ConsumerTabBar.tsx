// Custom bottom tab bar for the consumer app — Home / Cart / Partner / You, no
// dark marketplace surface since there's no auction tab.
//
// ORDERS IS NOT HERE. It moved behind Profile: an order history is something a
// shopper checks now and then, and a tab slot is for what they switch to many
// times a session.
//
// PARTNER IS A TAB, not a row buried in the profile. Every account on CropBid
// starts as a shopper (CLAUDE.md section 4), so this bar is what every single
// new user sees, and the door into selling or buying in bulk has to be visible
// from it rather than found. It keeps its slot after somebody applies, where it
// reports where the application stands.
//
// Cart carries a count badge. That badge is this app's answer to the web
// header's basket chip (client/src/components/consumer/CartBar.tsx): a shopper
// looking for their basket looks at the tab bar on a phone and at the header on
// a desktop, so each surface puts it where the habit already is.
import React from 'react';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { IconBasket, IconHome, IconSprout, IconUser, IcoProps } from '../components/icons';
import { useCart } from '../context/CartContext';
import { FloatingTabBar } from './FloatingTabBar';

const ICONS: Record<string, React.ComponentType<IcoProps>> = {
  Home: IconHome,
  Cart: IconBasket,
  Partner: IconSprout,
  You: IconUser,
};

export default function ConsumerTabBar(props: BottomTabBarProps) {
  const { count } = useCart();
  return (
    <FloatingTabBar
      {...props}
      icons={ICONS}
      badgeFor={(name) => (name === 'Cart' ? count : 0)}
    />
  );
}
