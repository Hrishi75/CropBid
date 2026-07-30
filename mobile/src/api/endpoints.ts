// Typed wrappers around the API endpoints the app uses.
import api, { setAccessToken, setRefreshToken } from './client';
import type {
  AgentConfig,
  AppNotification,
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

// `identifier` is the user's phone number (primary) or email — the server
// matches either column.
export async function login(identifier: string, password: string): Promise<User> {
  const { data } = await api.post<AuthResult>('/auth/login', { identifier, password });
  setAccessToken(data.accessToken);
  if (data.refreshToken) await setRefreshToken(data.refreshToken);
  return data.user;
}

export interface SignupInput {
  name: string;
  phone: string; // primary contact + login identifier
  email?: string;
  password: string;
  role: 'FARMER' | 'BUYER' | 'CONSUMER';
  country?: string;
  currency?: 'INR' | 'USD' | 'EUR' | 'GBP';
}

// A buyer signup parked pending email verification. No account exists yet —
// pendingId identifies the parked details, not a user.
export interface PendingSignup {
  pendingId: string;
  email: string;
  expiresAt: string;
}

// Signup ends one of two ways depending on role, so callers must branch:
//   FARMER / CONSUMER → 201, signed in on the spot (same payload as login, plus
//                       the refresh token in the body for X-Client: mobile).
//   BUYER             → 202, no tokens. The account does not exist until the
//                       emailed code is returned to verifySignupOtp.
export type SignupResult =
  | { status: 'created'; user: User }
  | { status: 'verification-required'; pending: PendingSignup };

export async function signup(input: SignupInput): Promise<SignupResult> {
  const { data, status } = await api.post<AuthResult & { pendingSignup?: PendingSignup }>(
    '/auth/signup',
    input,
  );

  if (status === 202 && data.pendingSignup) {
    return { status: 'verification-required', pending: data.pendingSignup };
  }

  setAccessToken(data.accessToken);
  if (data.refreshToken) await setRefreshToken(data.refreshToken);
  return { status: 'created', user: data.user };
}

// Buyer signup, step 2. The account is created by this call, so this is where a
// buyer's session begins.
export async function verifySignupOtp(pendingId: string, code: string): Promise<User> {
  const { data } = await api.post<AuthResult>('/auth/signup/verify', { pendingId, code });
  setAccessToken(data.accessToken);
  if (data.refreshToken) await setRefreshToken(data.refreshToken);
  return data.user;
}

// Asks for a fresh code. The previous one stops working immediately.
export async function resendSignupOtp(pendingId: string): Promise<PendingSignup> {
  const { data } = await api.post<{ pendingSignup: PendingSignup }>(
    '/auth/signup/resend',
    { pendingId },
  );
  return data.pendingSignup;
}

export async function fetchMe(): Promise<User> {
  const { data } = await api.get<{ user: User }>('/auth/me');
  return data.user;
}

// Farmer edits their account + farm details. Every field is optional; only the
// keys sent are updated server-side. Returns the same shape as fetchMe().
export interface UpdateFarmerProfileInput {
  name?: string;
  phone?: string | null;
  location?: string | null;
  farmSizeAcres?: number;
  cropsGrown?: string[];
  state?: string;
}

export async function updateFarmerProfile(input: UpdateFarmerProfileInput): Promise<User> {
  const { data } = await api.patch<{ user: User }>('/auth/me', input);
  return data.user;
}

// Profile photo — multipart field "avatar". Returns the fresh user.
export async function uploadAvatar(form: FormData): Promise<User> {
  const { data } = await api.post<{ user: User }>('/auth/me/avatar', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
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

// Permanently delete the caller's account. The current password rides in the
// body as confirmation — the server refuses without it.
export async function deleteAccount(password: string): Promise<void> {
  await api.delete('/auth/me', { data: { password } });
}

// --- Onboarding (creates the role profile required to use the app) ---
export interface FarmerOnboardingInput {
  farmSizeAcres: number;
  cropsGrown: string[];
  state: string;
  organicCertified?: boolean;
  fpoName?: string;
  apmcLicense?: string;
}

export interface BuyerOnboardingInput {
  companyName: string;
  companyType: 'PROCESSOR' | 'FMCG' | 'RESTAURANT' | 'EXPORTER' | 'RETAILER';
  taxId?: string;
  annualProcurementVolume?: string;
}

export async function farmerOnboarding(input: FarmerOnboardingInput): Promise<void> {
  await api.post('/auth/onboarding/farmer', input);
}

export async function buyerOnboarding(input: BuyerOnboardingInput): Promise<void> {
  await api.post('/auth/onboarding/buyer', input);
}

// --- Browse / listings ---
export async function browse(params?: {
  search?: string;
  crop?: string; // exact crop-name match (case-insensitive), unlike fuzzy `search`
  page?: number;
  directSale?: boolean;
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
  deliveryAddress?: string;
  contactPhone?: string;
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

// --- Consumer direct purchase (instant-buy, no negotiation) ---
// deliveryAddress/contactPhone are optional: when omitted the server snapshots
// the consumer's profile phone/location onto the order for the seller.
export async function directPurchase(input: {
  listingId: string;
  quantity: number;
  deliveryAddress?: string;
  contactPhone?: string;
}): Promise<Bid> {
  const { data } = await api.post<Bid>('/bids/direct-purchase', input);
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

// --- Notifications (DB feed; live push arrives over the socket: notification:new) ---
export interface NotificationsPage {
  notifications: AppNotification[];
  total: number;
  unreadCount: number;
}

export async function fetchNotifications(limit = 30, offset = 0): Promise<NotificationsPage> {
  const { data } = await api.get<NotificationsPage>('/notifications', { params: { limit, offset } });
  return data;
}

export async function unreadNotificationCount(): Promise<number> {
  const { data } = await api.get<{ count: number }>('/notifications/unread-count');
  return data.count;
}

export async function markNotificationRead(id: string): Promise<void> {
  await api.patch(`/notifications/${id}/read`);
}

export async function markAllNotificationsRead(): Promise<void> {
  await api.patch('/notifications/read-all');
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
