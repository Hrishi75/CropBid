// Motion kit — tiny animation primitives for the grocery-style screens.
// Core RN Animated only (no reanimated dep): spring press feedback, image
// fade-in, a pulsing skeleton block, list entrances and a count pop.
//
// THE FEEL IS FAST, NOT BOUNCY. Everything here is under ~280ms and runs on
// the native driver, so it never waits on JavaScript and never holds a tap up.
// Motion says "this responded" or "this arrived"; it is not decoration, which
// is why nothing loops except the loading pulse.
import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Easing,
  LayoutAnimation,
  Platform,
  Pressable,
  UIManager,
  type ImageStyle,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

// Old-architecture Android needs an explicit opt-in for LayoutAnimation.
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// Animate the next list re-layout (filter/search/data changes) so items glide
// instead of snapping. Call right before the setState that changes the list.
export function glide() {
  LayoutAnimation.configureNext(LayoutAnimation.create(200, 'easeInEaseOut', 'opacity'));
}

/** The one easing curve for things arriving: fast out, soft landing. */
export const EASE_OUT = Easing.out(Easing.cubic);

// Pressable that springs down slightly while touched — the tactile card feel
// quick-commerce apps use everywhere. `style` lays out the Pressable (flex,
// width); `cardStyle` is the visual surface that scales.
export function PressScale({
  onPress,
  style,
  cardStyle,
  scaleTo = 0.97,
  children,
}: {
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  cardStyle?: StyleProp<ViewStyle>;
  scaleTo?: number;
  children: React.ReactNode;
}) {
  const v = useRef(new Animated.Value(1)).current;
  // Down is immediate and flat, so the finger feels it the instant it lands;
  // up has a hint of settle. The old single spring wobbled on the way down.
  const down = () =>
    Animated.timing(v, { toValue: scaleTo, duration: 90, easing: EASE_OUT, useNativeDriver: true }).start();
  const up = () =>
    Animated.spring(v, { toValue: 1, useNativeDriver: true, speed: 28, bounciness: 6 }).start();

  return (
    <Pressable
      onPress={onPress}
      onPressIn={down}
      onPressOut={up}
      style={style}
    >
      <Animated.View style={[cardStyle, { transform: [{ scale: v }] }]}>{children}</Animated.View>
    </Pressable>
  );
}

// Network image that fades in on load instead of popping.
export function FadeInImage({ uri, style }: { uri: string; style: StyleProp<ImageStyle> }) {
  const v = useRef(new Animated.Value(0)).current;
  return (
    <Animated.Image
      source={{ uri }}
      style={[style, { opacity: v }]}
      onLoad={() => Animated.timing(v, { toValue: 1, duration: 200, easing: EASE_OUT, useNativeDriver: true }).start()}
    />
  );
}

// Pulsing placeholder block for skeleton loading rows.
export function Pulse({ style }: { style?: StyleProp<ViewStyle> }) {
  const v = useRef(new Animated.Value(0.45)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 1, duration: 650, useNativeDriver: true }),
        Animated.timing(v, { toValue: 0.45, duration: 650, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [v]);
  return <Animated.View style={[style, { opacity: v }]} />;
}

/**
 * Fades a block up into place when it first mounts. `index` staggers a list:
 * each item starts 35ms after the one above, capped so a long list does not
 * keep the bottom rows waiting. Plays once, on mount; a re-render or a data
 * refresh does not replay it.
 */
export function Appear({
  index = 0,
  style,
  children,
}: {
  index?: number;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(v, {
      toValue: 1,
      duration: 260,
      delay: Math.min(index, 6) * 35,
      easing: EASE_OUT,
      useNativeDriver: true,
    }).start();
  }, [v, index]);
  return (
    <Animated.View
      style={[
        style,
        {
          opacity: v,
          transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}

/**
 * Gives whatever it wraps a quick pop whenever `value` changes: a count badge
 * going from 2 to 3. Not on first render, which would pop every badge on
 * every screen open.
 */
export function Pop({
  value,
  style,
  children,
}: {
  value: unknown;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}) {
  const v = useRef(new Animated.Value(1)).current;
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    v.setValue(1.35);
    Animated.spring(v, { toValue: 1, useNativeDriver: true, speed: 22, bounciness: 10 }).start();
  }, [value, v]);
  return <Animated.View style={[style, { transform: [{ scale: v }] }]}>{children}</Animated.View>;
}
