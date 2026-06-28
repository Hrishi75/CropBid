// Typed wrappers around the API endpoints the app uses.
import api, { setAccessToken, setRefreshToken } from './client';
import type {
  AgentConfig,
  Auction,
  Bid,
  DeliveryStatus,
  Listing,
  Negotiation,
  Paginated,
  Transaction,
  TransactionStats,
  User,
} from './types';

// --- Auth ---
interface AuthResult {
  user: User;
  accessToken: string;
  refreshToken?: string;
}

export async function login(email: string, password: string): Promise<User> {
  const { data } = await api.post<AuthResult>('/auth/login', { email, password });
  setAccessToken(data.accessToken);
  if (data.refreshToken) await setRefreshToken(data.refreshToken);
  return data.user;
}

export async function fetchMe(): Promise<User> {
  const { data } = await api.get<{ user: User }>('/auth/me');
  return data.user;
}

export async function logout(): Promise<void> {
  try {
    await api.post('/auth/logout');
  } finally {
    setAccessToken(null);
    await setRefreshToken(null);
  }
}

// --- Browse / listings ---
export async function browse(params?: {
  search?: string;
  page?: number;
}): Promise<Paginated<Listing>> {
  const { data } = await api.get<Paginated<Listing>>('/browse', { params });
  return data;
}

export async function fetchListing(id: string): Promise<Listing> {
  const { data } = await api.get<Listing>(`/listings/${id}`);
  return data;
}

// --- Farmer listings (own) ---
export async function myListings(): Promise<Paginated<Listing>> {
  const { data } = await api.get<Paginated<Listing>>('/listings/my');
  return data;
}

// Create with optional photos — sent as multipart/form-data (see listing.routes.ts).
export async function createListing(form: FormData): Promise<Listing> {
  const { data } = await api.post<Listing>('/listings', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}

// Edit is a JSON body (photos are managed separately via the create/image routes).
export async function updateListing(
  id: string,
  body: Record<string, unknown>,
): Promise<Listing> {
  const { data } = await api.put<Listing>(`/listings/${id}`, body);
  return data;
}

export async function deleteListing(id: string): Promise<void> {
  await api.delete(`/listings/${id}`);
}

// --- Bids ---
export async function placeBid(input: {
  listingId: string;
  bidPricePerUnit: number;
  quantity: number;
  message?: string;
}): Promise<Bid> {
  const { data } = await api.post<Bid>('/bids', input);
  return data;
}

export async function myBids(): Promise<Bid[]> {
  const { data } = await api.get<Bid[]>('/bids/my');
  return data;
}

export async function incomingBids(status?: string): Promise<Bid[]> {
  const { data } = await api.get<Bid[]>('/bids/incoming', {
    params: status ? { status } : undefined,
  });
  return data;
}

// --- Farmer bid actions ---
export async function acceptBid(id: string): Promise<Bid> {
  const { data } = await api.put<Bid>(`/bids/${id}/accept`);
  return data;
}

export async function rejectBid(id: string): Promise<Bid> {
  const { data } = await api.put<Bid>(`/bids/${id}/reject`);
  return data;
}

export async function counterBid(id: string, counterPrice: number): Promise<Bid> {
  const { data } = await api.put<Bid>(`/bids/${id}/counter`, { counterPrice });
  return data;
}

// --- Transactions ---
export async function myTransactions(): Promise<Transaction[]> {
  const { data } = await api.get<Transaction[]>('/transactions');
  return data;
}

export async function transactionStats(): Promise<TransactionStats> {
  const { data } = await api.get<TransactionStats>('/transactions/stats');
  return data;
}

export async function updateDeliveryStatus(
  id: string,
  status: DeliveryStatus,
): Promise<Transaction> {
  const { data } = await api.patch<Transaction>(`/transactions/${id}/delivery`, { status });
  return data;
}

// --- AI agent ---
export async function getAgentConfig(): Promise<AgentConfig> {
  const { data } = await api.get<AgentConfig>('/agent/config');
  return data;
}

export async function updateAgentConfig(input: Partial<AgentConfig>): Promise<AgentConfig> {
  const { data } = await api.put<AgentConfig>('/agent/config', input);
  return data;
}

export async function toggleAgent(): Promise<AgentConfig> {
  const { data } = await api.post<AgentConfig>('/agent/toggle');
  return data;
}

// --- Negotiations ---
export async function myNegotiations(): Promise<Negotiation[]> {
  const { data } = await api.get<Negotiation[]>('/negotiations');
  return data;
}

// --- Payments (Razorpay capture-only; reuses the web flow's order/verify API) ---
// createOrder mints (or reuses) a Razorpay order for a transaction; the returned
// keyId + orderId feed Checkout inside the in-app WebView. verifyPayment posts the
// signed Checkout handshake back so the server validates the HMAC and flips the
// transaction AWAITING_PAYMENT -> ESCROW. See server/src/services/payment.service.ts.
export interface PaymentOrder {
  orderId: string;
  amount: number; // smallest currency subunit (paise for INR)
  currency: string;
  keyId: string;
  transactionId: string;
}

export interface PaymentHandshake {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

export async function createPaymentOrder(transactionId: string): Promise<PaymentOrder> {
  const { data } = await api.post<PaymentOrder>('/payments/order', { transactionId });
  return data;
}

export async function verifyPayment(handshake: PaymentHandshake): Promise<Transaction> {
  const { data } = await api.post<Transaction>('/payments/verify', handshake);
  return data;
}

// --- Live auctions (read via REST; bidding stays on the web client's socket) ---
export async function listAuctions(): Promise<Auction[]> {
  const { data } = await api.get<Auction[]>('/auctions');
  return data;
}

export async function getAuctionState(listingId: string): Promise<Auction> {
  const { data } = await api.get<Auction>(`/auctions/${listingId}`);
  return data;
}
