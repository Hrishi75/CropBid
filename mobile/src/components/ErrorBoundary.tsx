// =============================================================================
// ErrorBoundary — last line of defence around the navigator
// =============================================================================
// Without this, any render-time throw unmounts the whole tree and the app shows
// a blank white screen: no message, no way back, and nothing in the logs a
// tester could send us. That is the worst possible failure mode on someone
// else's phone, so catch it and offer a retry instead.
//
// Retrying re-mounts the subtree rather than reloading the app, which is enough
// to recover from a transient render error (a malformed API payload reaching a
// screen, say) without the user losing their session.
//
// Class component because React only exposes error catching via lifecycle
// methods — there is no hook equivalent.
// =============================================================================

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, font, radius, spacing } from '../theme';
import { Button } from './ui';

interface Props {
  children: React.ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // No crash reporter wired up yet, so this is all we get. Keep it: on a
    // release build these still surface through `adb logcat`, which is the
    // only way to diagnose a tester's crash today.
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  reset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <View style={styles.wrap}>
        <Text style={styles.title}>Something went wrong</Text>
        <Text style={styles.body}>
          The app hit an unexpected error. Try again — if it keeps happening, please tell us
          what you were doing just before this screen appeared.
        </Text>

        {/* The message is deliberately shown: testers screenshot this, and it is
            the difference between a useful bug report and "it crashed". */}
        <View style={styles.detail}>
          <Text style={styles.detailText}>{error.message || String(error)}</Text>
        </View>

        <Button label="Try again" onPress={this.reset} />
      </View>
    );
  }
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.xl,
    backgroundColor: colors.surface,
    gap: spacing.md,
  },
  title: {
    fontFamily: font.serif,
    fontSize: 28,
    color: colors.text,
  },
  body: {
    fontFamily: font.sans,
    fontSize: 15,
    lineHeight: 22,
    color: colors.textSecondary,
  },
  detail: {
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  detailText: {
    fontFamily: font.mono,
    fontSize: 12,
    color: colors.textMuted,
  },
});
