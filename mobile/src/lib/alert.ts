// =============================================================================
// Alert — the one from react-native, plus a web implementation
// =============================================================================
// `Alert.alert` FROM react-native IS A NO-OP ON REACT-NATIVE-WEB. It does not
// throw, does not warn, and does not fall through to window.alert: the call
// returns and nothing happens. Every confirm in this app therefore did nothing
// in a browser, which is how the Log out button came to look broken.
//
// AND window.confirm IS NOT THE FIX. Plenty of browser contexts suppress native
// dialogs: an embedded preview pane returns false from confirm() immediately,
// without showing anything, which looks exactly like the no-op it replaced.
// Anything that depends on the host agreeing to render a dialog can be declined
// by the host.
//
// So on web this queues into components/AlertHost, a real React modal mounted
// at the root. Nothing outside the app decides whether it appears.
//
// Native keeps the platform dialog, which works and is what those users expect.
// =============================================================================

import { Alert as RNAlert, Platform, type AlertButton, type AlertOptions } from 'react-native';
import { pushAlert } from '../components/AlertHost';

type AlertFn = (
  title: string,
  message?: string,
  buttons?: AlertButton[],
  options?: AlertOptions,
) => void;

const webAlert: AlertFn = (title, message, buttons) => {
  pushAlert({ title, message, buttons: buttons ?? [] });
};

/**
 * Drop-in for react-native's Alert.
 *
 * Import this instead of the one from 'react-native' and the same call works on
 * every platform. Requires <AlertHost /> to be mounted (App.tsx) for the web
 * path to have somewhere to render.
 */
export const Alert = {
  alert: (Platform.OS === 'web' ? webAlert : RNAlert.alert) as AlertFn,
};
