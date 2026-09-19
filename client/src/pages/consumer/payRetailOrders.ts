// =============================================================================
// payRetailOrders: one Razorpay payment for one or more shop orders
// =============================================================================
// A basket from two shops is two orders with two delivery fees, and ONE payment
// (decided 2026-09-20): two approvals in a row for one basket is how a shopper
// gets lost. Checkout pays the basket it has just placed through here, and the
// orders page pays everything still owed the same way.
//
// The server opens one Razorpay order for the lot (POST /payments/order with
// retailOrderIds), hands back the same one if the shopper closes the modal and
// tries again, and verify marks every order paid together.
// =============================================================================

import api from '../../lib/axios';
import { openCheckout } from '../../lib/razorpay';

interface Payer {
  name?: string;
  email?: string | null;
  phone?: string | null;
}

export type PaymentOutcome = 'paid' | 'closed' | 'failed';

/**
 * Opens checkout for `retailOrderIds` and resolves once the shopper has either
 * paid (and the server has confirmed it), closed the window, or hit an error.
 * `failed` carries a message fit to show them.
 */
export async function payRetailOrders(
  retailOrderIds: string[],
  payer: Payer | null | undefined,
  description: string,
): Promise<{ outcome: PaymentOutcome; message?: string }> {
  let rzp: { keyId: string; amount: number; currency: string; orderId: string };
  try {
    ({ data: rzp } = await api.post('/payments/order', { retailOrderIds }));
  } catch (err: any) {
    return { outcome: 'failed', message: err.response?.data?.message || 'Could not start payment' };
  }

  return new Promise((resolve) => {
    openCheckout({
      key: rzp.keyId,
      amount: rzp.amount,
      currency: rzp.currency,
      order_id: rzp.orderId,
      name: 'CropBid',
      description,
      prefill: {
        name: payer?.name,
        email: payer?.email ?? undefined,
        contact: payer?.phone ?? undefined,
      },
      theme: { color: '#2f6b3a' },
      handler: async (resp) => {
        try {
          await api.post('/payments/verify', resp);
          resolve({ outcome: 'paid' });
        } catch (err: any) {
          // The money has been taken by now, so this is not "try again": the
          // webhook will usually record it, and the orders page shows the truth.
          resolve({
            outcome: 'failed',
            message: err.response?.data?.message
              || 'Payment taken but not yet confirmed. Check your orders in a minute.',
          });
        }
      },
      modal: { ondismiss: () => resolve({ outcome: 'closed' }) },
    }).catch(() => resolve({ outcome: 'failed', message: 'Could not open the payment window' }));
  });
}
