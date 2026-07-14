// Motion kit — tiny animation primitives for the grocery-style screens.
// Core RN Animated only (no reanimated dep): spring press feedback, image
// fade-in, and a pulsing skeleton block for loading states.
import React, { useEffect, useRef } from 'react';
import {
  Animated,
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
  LayoutAnimation.configureNext(LayoutAnimation.create(220, 'easeInEaseOut', 'opacity'));
}

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
  const to = (val: number) =>
    Animated.spring(v, { toValue: val, useNativeDriver: true, speed: 40, bounciness: 4 }).start();

  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => to(scaleTo)}
      onPressOut={() => to(1)}
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
      onLoad={() => Animated.timing(v, { toValue: 1, duration: 220, useNativeDriver: true }).start()}
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
