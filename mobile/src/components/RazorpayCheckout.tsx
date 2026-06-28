// =============================================================================
// RazorpayCheckout — in-app test checkout via WebView
// =============================================================================
// Razorpay has no hosted payment-link URL in this project; the web client opens
// Checkout from its checkout.js script (client/src/lib/razorpay.ts). We reuse the
// same flow on native by rendering that script inside a WebView:
//
//   1. parent creates a Razorpay order (POST /payments/order) and passes it here
//   2. this modal loads checkout.js with the order + key and opens Checkout
//   3. on success Checkout calls handler(); the page postMessage()s the signed
//      handshake out to RN, and we POST it to /payments/verify (authed axios)
//   4. the server validates the HMAC and flips the txn AWAITING_PAYMENT -> ESCROW
//
// Test mode: the keyId returned by the server is the Razorpay TEST key, so this
// is a test checkout — pay with card 4111 1111 1111 1111 (any future expiry/CVV).
// UPI app-switch isn't available inside a WebView; use a card for the demo.
// =============================================================================

import React, { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { colors, design, font } from '../theme';
import { verifyPayment, type PaymentOrder } from '../api/endpoints';
import { errorMessage } from '../api/client';
import type { Transaction } from '../api/types';

interface Prefill {
  name?: string;
  email?: string;
  contact?: string;
}

interface Props {
  order: PaymentOrder | null; // non-null => modal is open
  prefill?: Prefill;
  onPaid: (tx: Transaction) => void;
  onClose: (err?: string) => void;
}

// The page is loaded with an https baseUrl so checkout.js gets a real origin.
const CHECKOUT_ORIGIN = 'https://cropbid.in';

function buildHtml(order: PaymentOrder, prefill: Prefill): string {
  // All interpolated values go through JSON.stringify so they're safely quoted.
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
  <script src="https://checkout.razorpay.com/v1/checkout.js"></script>
</head>
<body style="margin:0;background:#f4f1ea;font-family:-apple-system,system-ui,sans-serif">
  <div style="padding:28px;color:#4a4a3f;font-size:15px">Opening secure checkout&hellip;</div>
  <script>
    function post(obj) {
      if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(obj));
    }
    try {
      var rzp = new Razorpay({
        key: ${JSON.stringify(order.keyId)},
        order_id: ${JSON.stringify(order.orderId)},
        amount: ${JSON.stringify(order.amount)},
        currency: ${JSON.stringify(order.currency)},
        name: 'CropBid',
        description: 'Escrow payment',
        prefill: ${JSON.stringify(prefill)},
        theme: { color: '#1f2d18' },
        handler: function (resp) {
          post({
            type: 'success',
            razorpay_order_id: resp.razorpay_order_id,
            razorpay_payment_id: resp.razorpay_payment_id,
            razorpay_signature: resp.razorpay_signature,
          });
        },
        modal: { ondismiss: function () { post({ type: 'dismiss' }); }, confirm_close: false },
      });
      rzp.on('payment.failed', function (resp) {
        post({ type: 'error', message: (resp && resp.error && resp.error.description) || 'Payment failed' });
      });
      rzp.open();
    } catch (e) {
      post({ type: 'error', message: String((e && e.message) || e) });
    }
  </script>
</body>
</html>`;
}

export default function RazorpayCheckout({ order, prefill, onPaid, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);

  async function onMessage(event: WebViewMessageEvent) {
    let msg: { type?: string; message?: string } & Record<string, string>;
    try {
      msg = JSON.parse(event.nativeEvent.data);
    } catch {
      return; // ignore non-JSON chatter from the page
    }

    if (msg.type === 'success') {
      setVerifying(true);
      try {
        const tx = await verifyPayment({
          razorpay_order_id: msg.razorpay_order_id,
          razorpay_payment_id: msg.razorpay_payment_id,
          razorpay_signature: msg.razorpay_signature,
        });
        onPaid(tx);
      } catch (e) {
        onClose(errorMessage(e, 'Payment captured but verification failed. Pull to refresh.'));
      } finally {
        setVerifying(false);
      }
    } else if (msg.type === 'error') {
      onClose(msg.message || 'Payment failed');
    } else if (msg.type === 'dismiss') {
      onClose();
    }
  }

  // Reset transient state each time a new order opens the modal.
  const visible = order !== null;
  const html = order ? buildHtml(order, prefill ?? {}) : '';

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onShow={() => {
        setLoading(true);
        setVerifying(false);
      }}
      onRequestClose={() => onClose()}
    >
      <View style={[styles.flex, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Text style={styles.title}>Secure checkout</Text>
          <Pressable hitSlop={10} onPress={() => onClose()} disabled={verifying}>
            <Text style={[styles.cancel, verifying && { opacity: 0.4 }]}>Cancel</Text>
          </Pressable>
        </View>

        {visible ? (
          <WebView
            originWhitelist={['*']}
            source={{ html, baseUrl: CHECKOUT_ORIGIN }}
            onMessage={onMessage}
            onLoadEnd={() => setLoading(false)}
            javaScriptEnabled
            domStorageEnabled
            style={styles.flex}
          />
        ) : null}

        {(loading || verifying) && (
          <View style={styles.overlay} pointerEvents="none">
            <ActivityIndicator color={colors.forest} />
            {verifying ? <Text style={styles.overlayText}>Confirming payment&hellip;</Text> : null}
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: design.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: design.line,
    backgroundColor: design.paper,
  },
  title: { fontFamily: font.sansMed, fontSize: 16, color: design.ink },
  cancel: { fontFamily: font.sansMed, fontSize: 14, color: colors.ember },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: 'rgba(244,241,234,0.85)',
  },
  overlayText: { fontFamily: font.sans, fontSize: 13.5, color: design.ink2 },
});
