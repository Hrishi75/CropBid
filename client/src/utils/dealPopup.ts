// Whether this account has already seen the "Deal made" popup for a deal
// (components/deals/DealMadeModal). Per deal and per account, in localStorage.
// A convenience only: blocked storage means the popup shows once more.

const key = (transactionId: string, userId: string) => `cb-deal-made:${transactionId}:${userId}`;

export function dealPopupSeen(transactionId: string, userId: string): boolean {
  try {
    return localStorage.getItem(key(transactionId, userId)) === '1';
  } catch {
    return false;
  }
}

export function markDealPopupSeen(transactionId: string, userId: string) {
  try {
    localStorage.setItem(key(transactionId, userId), '1');
  } catch {
    // Private window or blocked storage: the popup simply shows again.
  }
}
