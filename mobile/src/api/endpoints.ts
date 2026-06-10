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

export async function incomingBids(): Promise<Bid[]> {
  const { data } = await api.get<Bid[]>('/bids/incoming');
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

// --- Live auctions (read via REST; bidding stays on the web client's socket) ---
export async function listAuctions(): Promise<Auction[]> {
  const { data } = await api.get<Auction[]>('/auctions');
  return data;
}

export async function getAuctionState(listingId: string): Promise<Auction> {
  const { data } = await api.get<Auction>(`/auctions/${listingId}`);
  return data;
}
