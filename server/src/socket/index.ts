// =============================================================================
// Socket.io Server — Real-Time WebSocket Layer
// =============================================================================
// WHY WEBSOCKETS FOR AUCTIONS?
// HTTP is request-response: client asks, server answers. But live auctions
// need SERVER-PUSH: "someone just bid higher!" must reach ALL participants
// instantly, without each client polling every second.
//
// Socket.io wraps WebSockets with:
//   - Automatic reconnection if the connection drops
//   - Room-based broadcasting (only people in this auction get updates)
//   - Fallback to HTTP long-polling if WebSockets fail (corporate firewalls)
//   - Built-in acknowledgements (client knows the server received its message)
//
// ARCHITECTURE:
//   - Each auction is a Socket.io "room" named `auction:<listingId>`
//   - When a user joins, they join that room
//   - When someone bids, the server broadcasts to the room
//   - The server tracks auction state in-memory (active auctions Map)
//   - Auction state is persisted to DB when the auction ends
//
// WHY IN-MEMORY STATE?
// Auctions are short-lived (minutes, not days). Storing every bid in the
// database during the auction would be slow and unnecessary. We keep a
// Map<listingId, AuctionState> in memory and only persist the final result.
// If the server crashes during an auction, the auction is lost — acceptable
// for an MVP. Production would use Redis for shared state across servers.
// =============================================================================

import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import { config } from '../config';
import { verifyAccessToken } from '../utils/jwt';
import { prisma } from '../lib/prisma';
import { createTransaction } from '../services/transaction.service';

// =============================================================================
// Types
// =============================================================================
interface AuctionBid {
  userId: string;
  userName: string;
  price: number;
  timestamp: string;
}

interface AuctionState {
  listingId: string;
  cropName: string;
  unit: string;
  currency: string;
  startPrice: number;       // Floor price — bidding starts here
  currentPrice: number;     // Current highest bid
  currentWinner: string | null;  // userId of current highest bidder
  currentWinnerName: string | null;
  bids: AuctionBid[];       // All bids in order
  participants: Set<string>; // Set of userIds in the room
  farmerId: string;         // The farmer who owns the listing
  endsAt: Date;             // When the auction ends (may extend on anti-sniping)
  hardEndsAt: Date;         // Absolute ceiling — anti-sniping cannot push past this
  timer: NodeJS.Timeout | null; // Reference to the end timer
}

// Per-socket bid-rate tracking. Token bucket: max BID_BURST bids per
// BID_WINDOW_MS window per socket. Cleared on disconnect.
const BID_WINDOW_MS = 5_000;
const BID_BURST = 5;
const ANTI_SNIPE_WINDOW_MS = 30_000;
const ANTI_SNIPE_EXTENSION_MS = 30_000;
// Hard cap so an attacker (or an enthusiastic bidder) cannot extend a
// 10-minute auction indefinitely. 5 minutes past the original endsAt.
const ANTI_SNIPE_MAX_EXTENSION_MS = 5 * 60 * 1000;
const bidTimestamps = new WeakMap<Socket, number[]>();

function recordBid(socket: Socket): boolean {
  const now = Date.now();
  const history = bidTimestamps.get(socket) ?? [];
  const fresh = history.filter((t) => now - t < BID_WINDOW_MS);
  if (fresh.length >= BID_BURST) return false;
  fresh.push(now);
  bidTimestamps.set(socket, fresh);
  return true;
}

// Re-validate a user's role against the database RIGHT NOW, rather than trusting
// the role captured from the JWT at handshake. A socket outlives its 15-minute
// access token and survives an account-role change, so the handshake claim can
// go stale while the connection stays open. Any authorization decision that
// persists a sale must confirm the CURRENT role. Returns true only if the
// account still exists AND is a BUYER.
async function isCurrentBuyer(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });
  return user?.role === 'BUYER';
}

// In-memory auction store
const activeAuctions = new Map<string, AuctionState>();

// Socket.io server instance (exported for use in other services)
let io: Server;

export function getIO() {
  return io;
}

// =============================================================================
// INITIALIZE — Attach Socket.io to HTTP server
// =============================================================================
export function initializeSocket(httpServer: HttpServer) {
  io = new Server(httpServer, {
    cors: {
      origin: config.clientUrl,
      credentials: true,
    },
    // WHY /socket.io path?
    // This matches the Vite proxy config (client proxies /socket.io → server).
    // Default path is /socket.io, so we don't need to specify it, but
    // being explicit makes it searchable.
  });

  // =========================================================================
  // AUTH MIDDLEWARE — Verify JWT before allowing connection
  // =========================================================================
  // Socket.io has its own middleware system. We extract the JWT from
  // the `auth` object that the client sends during the handshake.
  io.use((socket: Socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) {
      return next(new Error('Authentication required'));
    }

    try {
      const payload = verifyAccessToken(token);
      (socket as any).userId = payload.userId;
      (socket as any).role = payload.role;
      (socket as any).userName = socket.handshake.auth?.userName || 'Anonymous';
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  // =========================================================================
  // CONNECTION HANDLER — What happens when a client connects
  // =========================================================================
  io.on('connection', (socket: Socket) => {
    const userId = (socket as any).userId;
    const userName = (socket as any).userName;
    // Set from the verified JWT payload in the handshake middleware above — it
    // is the token's claim, not anything the client can assert separately.
    const role = (socket as any).role;
    console.log(`Socket connected: ${userId} (${userName})`);

    // Auto-join user's personal notification room
    // This enables targeted push notifications via io.to(`user:${userId}`)
    socket.join(`user:${userId}`);

    // --- JOIN AUCTION ---
    socket.on('auction:join', async (listingId: string) => {
      const roomName = `auction:${listingId}`;
      socket.join(roomName);

      const auction = activeAuctions.get(listingId);
      if (auction) {
        auction.participants.add(userId);

        // Send current state to the joining user
        socket.emit('auction:state', serializeAuction(auction));

        // Notify room that someone joined
        io.to(roomName).emit('auction:participant_count', auction.participants.size);
      } else {
        socket.emit('auction:error', 'This auction is not active');
      }
    });

    // --- LEAVE AUCTION ---
    socket.on('auction:leave', (listingId: string) => {
      const roomName = `auction:${listingId}`;
      socket.leave(roomName);

      const auction = activeAuctions.get(listingId);
      if (auction) {
        auction.participants.delete(userId);
        io.to(roomName).emit('auction:participant_count', auction.participants.size);
      }
    });

    // --- PLACE BID ---
    socket.on('auction:bid', async (data: { listingId: string; price: number }) => {
      // Validate input shape before doing anything else
      if (!data || typeof data.listingId !== 'string' || typeof data.price !== 'number' || !Number.isFinite(data.price)) {
        return socket.emit('auction:error', 'Invalid bid payload');
      }

      // Only BUYERs may bid — the same guard every REST bidding route carries
      // (requireRole('BUYER') in bid.routes.ts). Without it this socket was a
      // way around that check: a self-registered CONSUMER (or a rival FARMER)
      // could win an auction, and endAuction writes a real ACCEPTED bid, marks
      // the listing SOLD, and opens a Transaction — taking the lot off the
      // market on behalf of a principal the REST layer would have 403'd.
      //
      // `role` is the handshake JWT claim: a cheap first gate that rejects
      // non-buyers with zero DB cost. But a socket outlives its 15-minute
      // access token and survives an account-role change, so this claim can go
      // stale — the live DB re-check below is the authoritative guard.
      if (role !== 'BUYER') {
        return socket.emit('auction:error', 'Only buyer accounts can bid in auctions');
      }

      // Per-socket rate limit — stops bid flooding from a single client (and
      // caps how often the live authorization re-check below can hit the DB).
      if (!recordBid(socket)) {
        return socket.emit('auction:error', `Too many bids — slow down (max ${BID_BURST} per ${BID_WINDOW_MS / 1000}s)`);
      }

      // Live authorization: confirm the account is STILL a BUYER right now, not
      // just when the socket connected. Closes the stale-role window where a
      // since-demoted buyer — or one riding an already-expired access token —
      // could keep winning auctions through an already-open socket. Runs after
      // the rate limiter so a flood of bids can't turn into a flood of queries.
      if (!(await isCurrentBuyer(userId))) {
        return socket.emit('auction:error', 'Your account is no longer authorized to bid');
      }

      const auction = activeAuctions.get(data.listingId);
      if (!auction) {
        return socket.emit('auction:error', 'Auction not found or ended');
      }

      // Validation
      if (userId === auction.farmerId) {
        return socket.emit('auction:error', 'Cannot bid on your own auction');
      }
      if (new Date() > auction.endsAt) {
        return socket.emit('auction:error', 'Auction has ended');
      }
      if (data.price <= auction.currentPrice) {
        return socket.emit('auction:error', `Bid must be higher than ${auction.currentPrice}`);
      }

      // Update auction state
      const bid: AuctionBid = {
        userId,
        userName,
        price: data.price,
        timestamp: new Date().toISOString(),
      };

      auction.bids.push(bid);
      auction.currentPrice = data.price;
      auction.currentWinner = userId;
      auction.currentWinnerName = userName;

      // Broadcast the new bid to everyone in the room
      const roomName = `auction:${data.listingId}`;
      io.to(roomName).emit('auction:new_bid', {
        ...bid,
        currentPrice: auction.currentPrice,
        currentWinner: auction.currentWinnerName,
        bidCount: auction.bids.length,
      });

      // Anti-sniping: if a bid comes in the last 30 seconds, extend by 30s
      // but never past hardEndsAt so the auction can't be stretched forever.
      const now = Date.now();
      const timeLeft = auction.endsAt.getTime() - now;
      const hardLeft = auction.hardEndsAt.getTime() - now;
      if (timeLeft < ANTI_SNIPE_WINDOW_MS && hardLeft > 0) {
        const extension = Math.min(ANTI_SNIPE_EXTENSION_MS, hardLeft);
        auction.endsAt = new Date(now + extension);
        if (auction.timer) clearTimeout(auction.timer);
        auction.timer = setTimeout(() => endAuction(data.listingId), extension);

        io.to(roomName).emit('auction:time_extended', {
          newEndTime: auction.endsAt.toISOString(),
          hardEndTime: auction.hardEndsAt.toISOString(),
          reason: 'Anti-sniping: bid in last 30 seconds',
        });
      }
    });

    // --- DISCONNECT ---
    socket.on('disconnect', () => {
      console.log(`Socket disconnected: ${userId}`);
      // Remove from all active auctions
      for (const [listingId, auction] of activeAuctions) {
        if (auction.participants.has(userId)) {
          auction.participants.delete(userId);
          io.to(`auction:${listingId}`).emit(
            'auction:participant_count',
            auction.participants.size
          );
        }
      }
    });
  });

  return io;
}

// =============================================================================
// START AUCTION — Called by the auction service
// =============================================================================
export async function startAuction(
  listingId: string,
  durationMinutes: number = 10
): Promise<AuctionState> {
  if (activeAuctions.has(listingId)) {
    throw new Error('Auction already active for this listing');
  }

  const listing = await prisma.listing.findUnique({
    where: { id: listingId },
    include: {
      farmer: {
        include: { user: { select: { id: true, name: true } } },
      },
    },
  });

  if (!listing) throw new Error('Listing not found');
  if (listing.status !== 'ACTIVE') {
    throw new Error(`Cannot start auction on ${listing.status} listing`);
  }

  const endsAt = new Date(Date.now() + durationMinutes * 60 * 1000);
  const hardEndsAt = new Date(endsAt.getTime() + ANTI_SNIPE_MAX_EXTENSION_MS);

  const auction: AuctionState = {
    listingId,
    cropName: listing.cropName,
    unit: listing.unit,
    currency: listing.currency,
    startPrice: listing.pricePerUnitMin,
    currentPrice: listing.pricePerUnitMin,
    currentWinner: null,
    currentWinnerName: null,
    bids: [],
    participants: new Set(),
    farmerId: listing.farmer.userId,
    endsAt,
    hardEndsAt,
    timer: setTimeout(() => endAuction(listingId), durationMinutes * 60 * 1000),
  };

  activeAuctions.set(listingId, auction);

  // Update listing status to IN_AUCTION
  await prisma.listing.update({
    where: { id: listingId },
    data: { status: 'IN_AUCTION' },
  });

  // Broadcast to any connected clients watching this listing
  if (io) {
    io.emit('auction:started', {
      listingId,
      cropName: listing.cropName,
      startPrice: listing.pricePerUnitMin,
      endsAt: endsAt.toISOString(),
      farmerName: listing.farmer.user.name,
    });
  }

  return auction;
}

// =============================================================================
// END AUCTION — Called by timer or manually
// =============================================================================
async function endAuction(listingId: string) {
  const auction = activeAuctions.get(listingId);
  if (!auction) return;

  // Clear the timer
  if (auction.timer) clearTimeout(auction.timer);

  const roomName = `auction:${listingId}`;

  if (auction.currentWinner && auction.bids.length > 0) {
    // Fetch listing once for quantity
    const listing = await prisma.listing.findUnique({ where: { id: listingId } });
    if (!listing) {
      activeAuctions.delete(listingId);
      return;
    }

    const winnerId = auction.currentWinner; // narrowed to string by the if above

    // Final authorization gate. The winner passed a live BUYER check when they
    // bid, but settlement can run minutes later — long enough for the account to
    // have been demoted in the meantime. Never mint an ACCEPTED bid + escrow
    // Transaction for a principal the REST layer would now 403: if the winner is
    // no longer a BUYER, void the sale and return the listing to the market
    // instead of settling it onto them.
    if (!(await isCurrentBuyer(winnerId))) {
      console.warn(
        `Auction ${listingId} winner ${winnerId} is no longer a BUYER — voiding sale, reverting listing to ACTIVE`
      );
      await prisma.listing.update({
        where: { id: listingId },
        data: { status: 'ACTIVE' },
      });
      io.to(roomName).emit('auction:ended', {
        listingId,
        winner: null,
        finalPrice: auction.startPrice,
        totalBids: auction.bids.length,
        message: 'Auction voided — winning bidder is no longer authorized to buy',
      });
      activeAuctions.delete(listingId);
      return;
    }

    // Persist the winning sale (winning bid + SOLD listing) and its escrow
    // transaction ATOMICALLY, so a settled auction can never leave a SOLD
    // listing with no payable transaction. Wrapped in try/catch because
    // endAuction runs from a setTimeout with no caller to handle a rejection.
    let winningBid;
    try {
      winningBid = await prisma.$transaction(async (tx) => {
        const wb = await tx.bid.create({
          data: {
            listingId,
            buyerId: winnerId,
            bidPricePerUnit: auction.currentPrice,
            quantity: listing.quantity,
            totalAmount: auction.currentPrice * listing.quantity,
            currency: auction.currency as any,
            message: `Won via live auction (${auction.bids.length} bids)`,
            isAgentBid: false,
            status: 'ACCEPTED',
          },
        });
        await tx.listing.update({
          where: { id: listingId },
          data: { status: 'SOLD' },
        });
        await createTransaction(wb.id, tx);
        return wb;
      });
    } catch (err) {
      console.error(`Failed to settle auction ${listingId}:`, err);
      activeAuctions.delete(listingId);
      return;
    }

    // Broadcast auction end with winner
    io.to(roomName).emit('auction:ended', {
      listingId,
      winner: auction.currentWinnerName,
      winnerId: auction.currentWinner,
      finalPrice: auction.currentPrice,
      totalBids: auction.bids.length,
      bidId: winningBid.id,
    });
  } else {
    // No bids — revert to ACTIVE
    await prisma.listing.update({
      where: { id: listingId },
      data: { status: 'ACTIVE' },
    });

    io.to(roomName).emit('auction:ended', {
      listingId,
      winner: null,
      finalPrice: auction.startPrice,
      totalBids: 0,
      message: 'Auction ended with no bids',
    });
  }

  // Clean up
  activeAuctions.delete(listingId);
}

// =============================================================================
// GET ACTIVE AUCTIONS — For the API to list running auctions
// =============================================================================
export function getActiveAuctions() {
  const auctions: any[] = [];
  for (const [, auction] of activeAuctions) {
    auctions.push(serializeAuction(auction));
  }
  return auctions;
}

export function getAuction(listingId: string) {
  const auction = activeAuctions.get(listingId);
  return auction ? serializeAuction(auction) : null;
}

// =============================================================================
// SERIALIZE — Convert auction state to JSON-safe format
// =============================================================================
function serializeAuction(auction: AuctionState) {
  return {
    listingId: auction.listingId,
    cropName: auction.cropName,
    unit: auction.unit,
    currency: auction.currency,
    startPrice: auction.startPrice,
    currentPrice: auction.currentPrice,
    currentWinner: auction.currentWinnerName,
    bidCount: auction.bids.length,
    participantCount: auction.participants.size,
    bids: auction.bids.slice(-20), // Last 20 bids only
    endsAt: auction.endsAt.toISOString(),
    farmerId: auction.farmerId,
  };
}
