// =============================================================================
// AlertHost — the dialog the web build actually gets
// =============================================================================
// WHY THIS EXISTS, in two steps.
//
// First: `Alert.alert` from react-native is a NO-OP on react-native-web. It
// does not throw, does not warn, and does not fall through to window.alert.
// Every confirm in the app therefore did nothing in a browser, which is how the
// Log out button came to look broken.
//
// Second: replacing it with window.confirm was not enough. Plenty of browser
// contexts suppress native dialogs entirely, and an embedded pane is one of
// them: confirm() there returns false immediately without ever showing
// anything. A suppressed dialog looks exactly like the no-op it replaced.
//
// So this owns the whole thing in React. No browser dialogs, nothing the host
// can decline to render, and it paints in the app's own type and colours.
//
// IMPERATIVE ON PURPOSE. Alert.alert is called from inside callbacks and async
// handlers all over the app, where there is no component to hang state on.
// Rewriting 51 call sites into render-time state would be a far larger and
// riskier change than a module-level queue plus one host mounted at the root.
//
// ONE AT A TIME, QUEUED. Two dialogs racing (a failed save that also triggers a
// permission warning) would otherwise clobber each other and the second's
// buttons would run against the first's text.
// =============================================================================

import React, { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import type { AlertButton } from 'react-native';
import { colors, design, font, radius, spacing } from '../theme';

export interface PendingAlert {
  title: string;
  message?: string;
  buttons: AlertButton[];
}

type Listener = (queue: PendingAlert[]) => void;

let queue: PendingAlert[] = [];
let listeners: Listener[] = [];

function emit() {
  // A fresh array each time: handing the same reference back would make
  // useState skip the render.
  for (const l of listeners) l([...queue]);
}

/** Queue a dialog. Called by lib/alert on web. */
export function pushAlert(alert: PendingAlert) {
  queue = [...queue, alert];
  emit();
}

function shift() {
  queue = queue.slice(1);
  emit();
}

/**
 * Mounted once, at the root, above everything that might raise a dialog.
 *
 * Renders nothing until something is queued, so it costs a subscription and no
 * layout the rest of the time.
 */
export function AlertHost() {
  const [pending, setPending] = useState<PendingAlert[]>([]);

  useEffect(() => {
    listeners.push(setPending);
    // Catch anything queued between module load and this mount.
    setPending([...queue]);
    return () => { listeners = listeners.filter((l) => l !== setPending); };
  }, []);

  const current = pending[0];
  if (!current) return null;

  function choose(button: AlertButton) {
    // Dismiss FIRST, then run the handler. A handler that navigates or signs
    // out would otherwise unmount this host mid-callback and leave the queue
    // holding a dialog nothing will ever close.
    shift();
    try {
      const result = button.onPress?.() as unknown;
      if (result && typeof (result as Promise<unknown>).catch === 'function') {
        (result as Promise<unknown>).catch(() => {});
      }
    } catch {
      // The handler threw synchronously. Its own screen owns that error; a
      // dialog host is the wrong place to surface it.
    }
  }

  const buttons = current.buttons.length > 0
    ? current.buttons
    // A message with no buttons still needs a way out.
    : [{ text: 'OK' } as AlertButton];

  // Stacked when there are more than two, or when any label is long enough that
  // two side by side would wrap mid-word.
  const stacked = buttons.length > 2 || buttons.some((b) => (b.text ?? '').length > 14);

  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => {
      // Android back. Treat it as the cancel button if there is one, and as a
      // plain dismissal otherwise, which is what the OS dialog does.
      const cancel = buttons.find((b) => b.style === 'cancel');
      if (cancel) choose(cancel);
      else shift();
    }}>
      <View style={styles.scrim}>
        <View style={styles.card}>
          <Text style={styles.title}>{current.title}</Text>
          {current.message ? <Text style={styles.message}>{current.message}</Text> : null}

          <View style={[styles.actions, stacked && styles.actionsStacked]}>
            {buttons.map((b, i) => (
              <Pressable
                key={`${b.text}-${i}`}
                onPress={() => choose(b)}
                style={({ pressed }) => [
                  styles.btn,
                  stacked ? styles.btnFull : styles.btnFlex,
                  b.style === 'cancel' ? styles.btnGhost : styles.btnSolid,
                  b.style === 'destructive' && styles.btnDanger,
                  pressed && { opacity: 0.85 },
                ]}
              >
                <Text
                  style={[
                    styles.btnText,
                    b.style === 'cancel' && styles.btnTextGhost,
                  ]}
                >
                  {b.text}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    backgroundColor: 'rgba(20,20,15,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: design.paper,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  title: { fontFamily: font.sansBold, fontSize: 18, color: design.ink, letterSpacing: -0.3 },
  message: { fontFamily: font.sans, fontSize: 14.5, lineHeight: 21, color: design.ink2, marginTop: 8 },

  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
  actionsStacked: { flexDirection: 'column-reverse' },
  btn: {
    borderRadius: radius.md,
    paddingVertical: 12,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  btnFlex: { flex: 1 },
  btnFull: { width: '100%' },
  btnSolid: { backgroundColor: colors.forest },
  btnDanger: { backgroundColor: colors.ember },
  btnGhost: { backgroundColor: 'transparent', borderWidth: 1, borderColor: design.line },
  btnText: { fontFamily: font.sansSemi, fontSize: 15, color: colors.surface },
  btnTextGhost: { color: design.ink2 },
});
