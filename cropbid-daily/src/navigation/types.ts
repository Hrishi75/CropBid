// Route params. In its own file so screens can import the param lists without
// pulling in the navigator, and the screens it imports.

import type { NavigatorScreenParams } from '@react-navigation/native';

export type HomeStackParamList = {
  Shops: undefined;
  /**
   * The city travels with the shop id rather than being re-read from storage.
   * The server refuses a shop lookup without a city, and the shop was listed
   * under a specific one: re-reading storage would let a city change
   * mid-navigation open a shop under the wrong city.
   */
  Shop: { id: string; city: string };
};

/**
 * Orders live UNDER the account, not beside it.
 *
 * A tab is for something you switch to many times a session. Orders is not
 * that: a shopper checks an order when they are waiting for one, which is a
 * handful of times per order and never while shopping. It belongs with the
 * other things that are true about your account, the way every retail app puts
 * it behind the profile.
 *
 * The practical gain is the tab it frees. Three tabs put Basket in the middle,
 * where a thumb reaches it, instead of squeezing four into the same bar.
 */
export type ProfileStackParamList = {
  Profile: undefined;
  Orders: undefined;
};

export type RootTabParamList = {
  Home: NavigatorScreenParams<HomeStackParamList>;
  Cart: undefined;
  You: NavigatorScreenParams<ProfileStackParamList>;
};
