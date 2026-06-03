// =============================================================================
// Razorpay Checkout loader
// =============================================================================
// Razorpay's Checkout is a hosted script (checkout.js) that opens a payment modal.
// We load it on demand (not in index.html) so it only ships when a buyer pays.
// =============================================================================

const CHECKOUT_SRC = 'https://checkout.razorpay.com/v1/checkout.js';

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayOptions) => { open: () => void };
  }
}

export interface RazorpayHandlerResponse {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

export interface RazorpayOptions {
  key: string;
  amount: number;        // in paise
  currency: string;
  order_id: string;
  name?: string;
  description?: string;
  prefill?: { name?: string; email?: string; contact?: string };
  notes?: Record<string, string>;
  theme?: { color?: string };
  handler: (response: RazorpayHandlerResponse) => void;
  modal?: { ondismiss?: () => void };
}

let loadPromise: Promise<void> | null = null;

export function loadRazorpay(): Promise<void> {
  if (window.Razorpay) return Promise.resolve();
  if (loadPromise) return loadPromise;

  loadPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = CHECKOUT_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      loadPromise = null;
      reject(new Error('Failed to load Razorpay Checkout'));
    };
    document.body.appendChild(script);
  });

  return loadPromise;
}

export async function openCheckout(options: RazorpayOptions): Promise<void> {
  await loadRazorpay();
  if (!window.Razorpay) throw new Error('Razorpay unavailable');
  new window.Razorpay(options).open();
}
