// =============================================================================
// LoginSheet — log in on a card that rises from the bottom
// =============================================================================
// Signing in from the storefront no longer throws a guest onto a separate
// screen. One floating card does it, in up to two steps:
//
//   ask   "Log in to add this to your basket", naming what they just tapped.
//         Shown when they pressed ADD or a size; they asked to buy something,
//         so the answer starts from that thing.
//   form  the sign-in itself. Where the header's "Log in" opens straight to,
//         and where the ask's "Log in" moves to in place, without a new page.
//
// A FLOATING CARD, NOT AN EDGE-TO-EDGE SHEET. Inset from the sides and the
// bottom with all four corners rounded, so it reads as a short question over
// the page rather than a new screen. The backdrop FADES while the card
// SPRINGS up: the Modal's own "slide" would slide the dim layer up with it.
//
// The form calls the same AuthContext.signIn as LoginScreen, so the error
// messages and the refusal of an account that must change its password
// (CLAUDE.md §4) are exactly the full screen's. Forgot password and Create
// account still open their own screens: both are longer than a card should be.
//
// Says nothing about a code or a wait, because sign-up asks for none
// (CLAUDE.md §4), and nothing about the basket surviving the sign-in, because
// nothing guarantees it does.
// =============================================================================

import React, { useEffect, useRef, useState } from 'react';
import {
  Animated, Dimensions, Image, KeyboardAvoidingView, Modal, PanResponder, Platform,
  Pressable, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { errorMessage } from '../api/client';
import { Mono } from './buyerKit';
import { glide, PressScale } from './motion';
import { IconBasket } from './icons';
import { colors, design, font } from '../theme';

/** What the guest tapped, so the card can name it. */
export interface LoginSheetItem {
  name: string;
  /** "200 g". */
  size: string;
  /** Already formatted, "₹90". */
  price: string;
  image?: string | null;
}

const OFFSCREEN = Dimensions.get('window').height;

export function LoginSheet({
  item, visible, onClose, onForgot, onSignup,
}: {
  /** Set: open on the "add this" step. Null: open straight on the form. */
  item: LoginSheetItem | null;
  visible: boolean;
  onClose: () => void;
  onForgot: () => void;
  onSignup: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { signIn } = useAuth();
  const y = useRef(new Animated.Value(OFFSCREEN)).current;
  const fade = useRef(new Animated.Value(0)).current;
  // The Modal stays mounted until the card has slid away, so closing does not
  // cut the animation off half way. `visible` says where it is heading.
  const [mounted, setMounted] = useState(visible);
  const [step, setStep] = useState<'ask' | 'form'>(item ? 'ask' : 'form');

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (visible) {
      // Every opening starts from its own first step with a clean slate, so a
      // half-typed password from an abandoned attempt is not sitting there.
      setStep(item ? 'ask' : 'form');
      setPassword('');
      setError(null);
      setMounted(true);
      y.setValue(OFFSCREEN);
      Animated.parallel([
        Animated.timing(fade, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.spring(y, { toValue: 0, useNativeDriver: true, speed: 16, bounciness: 5 }),
      ]).start();
    } else if (mounted) {
      Animated.parallel([
        Animated.timing(fade, { toValue: 0, duration: 180, useNativeDriver: true }),
        Animated.timing(y, { toValue: OFFSCREEN, duration: 220, useNativeDriver: true }),
      ]).start(() => setMounted(false));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  // The responder is made once, so it reads the latest onClose through a ref.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Drag down to dismiss. Upward drags are ignored rather than stretching the
  // card off its resting place; a short drag springs back.
  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => g.dy > 6 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderMove: (_, g) => { if (g.dy > 0) y.setValue(g.dy); },
      onPanResponderRelease: (_, g) => {
        if (g.dy > 110 || g.vy > 0.9) onCloseRef.current();
        else Animated.spring(y, { toValue: 0, useNativeDriver: true, speed: 20, bounciness: 6 }).start();
      },
    }),
  ).current;

  if (!mounted) return null;

  // Leave the sheet before navigating, so the next screen does not open
  // underneath a card that is still on its way down.
  const go = (to: () => void) => { onClose(); to(); };

  async function submit() {
    if (!identifier.trim() || !password) {
      setError('Enter your phone number (or email) and password');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await signIn(identifier.trim(), password);
      // Signed in: the root navigator swaps to the account's own app.
      onClose();
    } catch (e) {
      setError(errorMessage(e, 'Login failed'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal visible transparent animationType="none" statusBarTranslucent onRequestClose={onClose}>
      <Animated.View style={[styles.backdrop, { opacity: fade }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
      </Animated.View>

      {/* Padding, on iOS, lifts the card clear of the keyboard as the form's
          fields take focus. Android resizes the window itself. */}
      <KeyboardAvoidingView
        style={styles.wrap}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        pointerEvents="box-none"
      >
        <Animated.View
          {...pan.panHandlers}
          style={[styles.card, { marginBottom: Math.max(insets.bottom, 12), transform: [{ translateY: y }] }]}
        >
          <View style={styles.handle} />

          {/* What they tapped, so the ask is about something concrete. Kept on
              the form step too: it is why they are logging in. */}
          {item ? (
            <View style={styles.item}>
              {item.image ? (
                <Image source={{ uri: item.image }} style={styles.thumb} />
              ) : (
                <View style={[styles.thumb, styles.thumbFallback]}>
                  <Text style={styles.thumbLetter}>{item.name.trim().charAt(0).toUpperCase()}</Text>
                </View>
              )}
              <View style={styles.itemText}>
                <Text style={styles.itemName} numberOfLines={1}>{item.name}</Text>
                <Mono style={styles.itemMeta}>{item.size.toUpperCase()} · {item.price}</Mono>
              </View>
              <View style={styles.basket}>
                <IconBasket size={18} stroke={colors.forest} />
              </View>
            </View>
          ) : null}

          {step === 'ask' ? (
            <>
              <Text style={styles.title}>Log in to add this to your basket</Text>
              <Text style={styles.body}>
                New here? Making an account takes a name, your phone number or
                email, and a password. No code to wait for.
              </Text>

              <PressScale onPress={() => { glide(); setStep('form'); }} scaleTo={0.97} cardStyle={styles.primary}>
                <Text style={styles.primaryText}>Log in</Text>
              </PressScale>
              <PressScale onPress={() => go(onSignup)} scaleTo={0.97} cardStyle={styles.secondary}>
                <Text style={styles.secondaryText}>Create an account</Text>
              </PressScale>
              <Pressable onPress={onClose} hitSlop={8} style={styles.later}>
                <Text style={styles.laterText}>Not now</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Text style={styles.title}>Log in to CropBid</Text>
              <Text style={styles.bodyTight}>With the phone number or email you signed up with.</Text>

              <Text style={styles.label}>Email or phone number</Text>
              <TextInput
                style={styles.input}
                value={identifier}
                onChangeText={setIdentifier}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="username"
                textContentType="username"
                placeholder="you@example.com or 9876543210"
                placeholderTextColor={design.ink3}
                returnKeyType="next"
              />

              <View style={styles.labelRow}>
                <Text style={styles.label}>Password</Text>
                {/* Beside the field, where somebody who has just failed to
                    remember it is already looking. */}
                <Pressable onPress={() => go(onForgot)} hitSlop={8}>
                  <Text style={styles.forgot}>Forgot password?</Text>
                </Pressable>
              </View>
              <TextInput
                style={styles.input}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoComplete="current-password"
                textContentType="password"
                placeholder="Your password"
                placeholderTextColor={design.ink3}
                onSubmitEditing={submit}
                returnKeyType="go"
              />

              {error ? <Text style={styles.error}>{error}</Text> : null}

              <PressScale
                onPress={submitting ? undefined : submit}
                scaleTo={0.97}
                cardStyle={[styles.primary, styles.primaryForm, submitting && styles.primaryBusy]}
              >
                <Text style={styles.primaryText}>{submitting ? 'Logging in…' : 'Log in'}</Text>
              </PressScale>

              <Pressable onPress={() => go(onSignup)} hitSlop={8} style={styles.later}>
                <Text style={styles.switchText}>
                  New to CropBid? <Text style={styles.switchLink}>Create an account</Text>
                </Text>
              </Pressable>
            </>
          )}
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    position: 'absolute', top: 0, right: 0, bottom: 0, left: 0,
    backgroundColor: 'rgba(20,20,15,0.45)',
  },
  wrap: { flex: 1, justifyContent: 'flex-end', paddingHorizontal: 12 },
  card: {
    backgroundColor: design.paper,
    borderRadius: 26,
    paddingHorizontal: 20, paddingTop: 10, paddingBottom: 14,
    shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 }, elevation: 12,
  },
  handle: {
    alignSelf: 'center', width: 38, height: 4, borderRadius: 2,
    backgroundColor: design.line, marginBottom: 16,
  },
  item: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: design.bg, borderRadius: 16, padding: 10, marginBottom: 16,
  },
  thumb: { width: 48, height: 48, borderRadius: 12, backgroundColor: design.paper },
  thumbFallback: { alignItems: 'center', justifyContent: 'center', backgroundColor: design.mint },
  thumbLetter: { fontFamily: font.sansBold, fontSize: 20, color: colors.sage },
  itemText: { flex: 1 },
  itemName: { fontFamily: font.sansSemi, fontSize: 15.5, color: design.ink },
  itemMeta: { fontSize: 10.5, letterSpacing: 0.6, color: design.ink3, marginTop: 3 },
  basket: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center', backgroundColor: design.mint,
  },
  title: { fontFamily: font.sansSemi, fontSize: 20, letterSpacing: -0.3, color: design.ink },
  body: { fontFamily: font.sans, fontSize: 13.5, lineHeight: 19, color: design.ink2, marginTop: 6, marginBottom: 18 },
  bodyTight: { fontFamily: font.sans, fontSize: 13.5, lineHeight: 19, color: design.ink2, marginTop: 4, marginBottom: 16 },
  label: { fontFamily: font.sansSemi, fontSize: 12.5, color: design.ink2, marginBottom: 6 },
  labelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  input: {
    backgroundColor: design.bg,
    borderWidth: 1, borderColor: design.line, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 13,
    fontFamily: font.sans, fontSize: 15.5, color: design.ink,
    marginBottom: 14,
  },
  forgot: { fontFamily: font.sansSemi, fontSize: 12.5, color: colors.ember },
  error: { fontFamily: font.sansMed, fontSize: 13, color: colors.ember, marginTop: -4, marginBottom: 10 },
  primary: {
    backgroundColor: colors.forest, borderRadius: 14,
    paddingVertical: 14, alignItems: 'center',
  },
  primaryForm: { marginTop: 2 },
  primaryBusy: { opacity: 0.7 },
  primaryText: { fontFamily: font.sansSemi, fontSize: 15, color: colors.surface },
  secondary: {
    marginTop: 8, borderRadius: 14, borderWidth: 1, borderColor: design.line,
    backgroundColor: design.paper, paddingVertical: 13, alignItems: 'center',
  },
  secondaryText: { fontFamily: font.sansSemi, fontSize: 15, color: colors.forest },
  later: { alignSelf: 'center', marginTop: 12, paddingVertical: 4, paddingHorizontal: 10 },
  laterText: { fontFamily: font.sansMed, fontSize: 13, color: design.ink3 },
  switchText: { fontFamily: font.sans, fontSize: 13.5, color: design.ink2 },
  switchLink: { fontFamily: font.sansSemi, color: colors.ember },
});
