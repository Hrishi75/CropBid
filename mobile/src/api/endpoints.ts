// Typed wrappers around the API endpoints the app uses.
import api, { setAccessToken, setRefreshToken } from './client';
import type { Bid, Listing, Paginated, User } from './types';

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
