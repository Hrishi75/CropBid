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
  endsAt: Date;             // When the auction ends
  timer: NodeJS.Timeout | null; // Reference to the end timer
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
    console.log(`Socket connected: ${userId} (${userName})`);

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

      // Anti-sniping: if bid comes in the last 30 seconds, extend by 30s
      const timeLeft = auction.endsAt.getTime() - Date.now();
      if (timeLeft < 30000) {
        auction.endsAt = new Date(Date.now() + 30000);
        if (auction.timer) clearTimeout(auction.timer);
        auction.timer = setTimeout(() => endAuction(data.listingId), 30000);

        io.to(roomName).emit('auction:time_extended', {
          newEndTime: auction.endsAt.toISOString(),
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
    // Create a bid record for the winner
    const winningBid = await prisma.bid.create({
      data: {
        listingId,
        buyerId: auction.currentWinner,
        bidPricePerUnit: auction.currentPrice,
        quantity: (await prisma.listing.findUnique({ where: { id: listingId } }))!.quantity,
        totalAmount: auction.currentPrice * (await prisma.listing.findUnique({ where: { id: listingId } }))!.quantity,
        currency: auction.currency as any,
        message: `Won via live auction (${auction.bids.length} bids)`,
        isAgentBid: false,
        status: 'ACCEPTED',
      },
    });

    // Mark listing as SOLD
    await prisma.listing.update({
      where: { id: listingId },
      data: { status: 'SOLD' },
    });

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
