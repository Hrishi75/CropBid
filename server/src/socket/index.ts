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

import { bidsOnMarket, RESTAURANT_NO_BIDS } from '../services/bid.service';
import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import { config } from '../config';
import { verifyAccessToken } from '../utils/jwt';
import { prisma } from '../lib/prisma';
import { createTransaction } from '../services/transaction.service';
import { alertNewOrder } from '../services/orderAlert.service';
import { createNotification } from '../services/notification.service';
import { ApiError } from '../utils/ApiError';

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
  quantity: number;         // What the winner buys: the lot's remaining stock at the start
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
// If settlement AND its listing-release fallback both fail (e.g. the DB is
// briefly unreachable), retry reconciliation on this interval instead of
// stranding the listing IN_AUCTION. The self-rescheduling timer stops as soon
// as one attempt reconciles the listing.
const SETTLEMENT_RETRY_MS = 60_000;
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

// WHO IS ON THE OTHER END OF A HANDSHAKE, or an Error saying why nobody is.
// Lifted out of the io.use below so the rule can be tested directly: proving it
// through a real handshake would mean adding a socket client to the server's
// dependencies for one test.
//
// A SESSION HOLDING A TEMPORARY PASSWORD IS REFUSED HERE TOO. The handshake
// takes the same access token as every HTTP route, and without this a reset
// account could open a socket and bid, or sit in its own room receiving
// events, while being refused everywhere else and supposed to be able to do
// one thing: choose a password. Review caught it. A socket already open when
// the reset lands stays open until it drops, which is the same window the
// access token itself has.
export function handshakeIdentity(token: unknown): { userId: string; role: string } {
  if (!token || typeof token !== 'string') {
    throw new Error('Authentication required');
  }

  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch {
    throw new Error('Invalid token');
  }

  if (payload.mustChangePassword) {
    throw new Error('Choose a new password before you carry on');
  }

  return { userId: payload.userId, role: payload.role };
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
    let identity;
    try {
      identity = handshakeIdentity(socket.handshake.auth?.token);
    } catch (error) {
      return next(error as Error);
    }

    (socket as any).userId = identity.userId;
    (socket as any).role = identity.role;
    (socket as any).userName = socket.handshake.auth?.userName || 'Anonymous';
    next();
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
      try {
        if (!(await isCurrentBuyer(userId))) {
          return socket.emit('auction:error', 'Your account is no longer authorized to bid');
        }
        // Same rule as POST /bids: a restaurant negotiates, it does not bid.
        if (!(await bidsOnMarket(userId))) {
          return socket.emit('auction:error', RESTAURANT_NO_BIDS);
        }
      } catch (err) {
        // A Prisma rejection here would otherwise escape this async Socket.IO
        // handler as an unhandled rejection (silent bid failure, and a process
        // crash under runtimes that exit on unhandled rejections). Surface a
        // retryable error to the client instead.
        console.error(`Failed to authorize auction bid from ${userId}:`, err);
        return socket.emit('auction:error', 'Unable to verify your account right now — please retry');
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
    throw new ApiError(409, 'An auction is already running on this lot');
  }

  // CLAIM THE LOT FIRST, conditionally. Only an ACTIVE lot can go to auction,
  // and the write itself says so, so two starts at once (or a sale landing as
  // the seller presses start) cannot both succeed: one claims, the other gets
  // count 0. The claim and the read after it are one transaction, so a failed
  // read rolls the claim back rather than leaving the lot IN_AUCTION with no
  // auction in memory to end it. The in-memory auction is created only after
  // the transaction commits, and nothing after that touches the database.
  const listing = await prisma.$transaction(async (tx) => {
    const claim = await tx.listing.updateMany({
      where: { id: listingId, status: 'ACTIVE' },
      data: { status: 'IN_AUCTION' },
    });
    if (claim.count === 0) {
      throw new ApiError(409, 'This lot can no longer be auctioned. It may have sold or already be in an auction.');
    }
    return tx.listing.findUniqueOrThrow({
      where: { id: listingId },
      include: {
        farmer: {
          include: { user: { select: { id: true, name: true } } },
        },
      },
    });
  });

  const endsAt = new Date(Date.now() + durationMinutes * 60 * 1000);
  const hardEndsAt = new Date(endsAt.getTime() + ANTI_SNIPE_MAX_EXTENSION_MS);

  const auction: AuctionState = {
    listingId,
    cropName: listing.cropName,
    unit: listing.unit,
    currency: listing.currency,
    quantity: listing.remainingQuantity,
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
    const winnerId = auction.currentWinner; // narrowed to string by the if above

    // settleAuctionSale (below) says what is checked and why. It is wrapped in
    // try/catch because endAuction runs from a setTimeout with no caller to
    // handle a rejection: on ANY failure the lot must still be released and the
    // in-memory auction dropped, or it is stranded IN_AUCTION with a dead timer.
    let settlement: AuctionSettlement;
    try {
      settlement = await settleAuctionSale({
        listingId,
        winnerId,
        price: auction.currentPrice,
        bidCount: auction.bids.length,
      });
    } catch (err) {
      console.error(`Failed to settle auction ${listingId}:`, err);
      // The transaction rolled back, so the listing is still IN_AUCTION.
      // Release it back to the market so it isn't stranded. Conditional, so a
      // lot that left the auction some other way is never put back on sale.
      try {
        await releaseAuctionLot(listingId);
      } catch (revertErr) {
        // Even the release failed — the DB is likely still unreachable. Dropping
        // the auction now would leave the listing stuck IN_AUCTION with no timer
        // and nothing in activeAuctions to reconcile it, requiring manual repair.
        // Instead keep the auction and re-arm a timer to retry reconciliation, so
        // it self-heals once the DB recovers. The retry loop ends as soon as one
        // attempt succeeds (settles, voids, or releases). A process crash still
        // loses it — the in-memory auction design already accepts that; a
        // production system would move this to Redis / a durable queue.
        console.error(
          `Failed to release listing ${listingId} after settlement error; retrying in ${SETTLEMENT_RETRY_MS / 1000}s:`,
          revertErr
        );
        auction.timer = setTimeout(() => endAuction(listingId), SETTLEMENT_RETRY_MS);
        return;
      }
      activeAuctions.delete(listingId);
      return;
    }

    if (settlement.outcome === 'sold') {
      void alertNewOrder(settlement.bidId!, 'AUCTION_WIN');

      // Broadcast auction end with winner
      io.to(roomName).emit('auction:ended', {
        listingId,
        winner: auction.currentWinnerName,
        winnerId: auction.currentWinner,
        finalPrice: auction.currentPrice,
        totalBids: auction.bids.length,
        bidId: settlement.bidId,
      });
    } else if (settlement.outcome === 'voided') {
      console.warn(
        `Auction ${listingId} winner ${winnerId} is no longer a BUYER — sale voided, listing returned to ACTIVE`
      );
      io.to(roomName).emit('auction:ended', {
        listingId,
        winner: null,
        finalPrice: auction.startPrice,
        totalBids: auction.bids.length,
        message: 'Auction voided — winning bidder is no longer authorized to buy',
      });
    } else {
      // 'gone': the lot was deleted, or is no longer in this auction, so there
      // is nothing to sell. Bidders are told rather than left on a frozen clock.
      io.to(roomName).emit('auction:ended', {
        listingId,
        winner: null,
        finalPrice: auction.currentPrice,
        totalBids: auction.bids.length,
        message: 'Auction closed: this lot is no longer available',
      });
    }
  } else {
    // No bids: back on the market, if it is still this auction's lot. If the
    // release fails (the database is unreachable), keep the auction and retry,
    // as the settlement branch does: dropping it would strand the lot
    // IN_AUCTION with nothing left to put it back.
    try {
      await releaseAuctionLot(listingId);
    } catch (err) {
      console.error(
        `Failed to release listing ${listingId} after an auction with no bids; retrying in ${SETTLEMENT_RETRY_MS / 1000}s:`,
        err
      );
      auction.timer = setTimeout(() => endAuction(listingId), SETTLEMENT_RETRY_MS);
      return;
    }

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
// SETTLE AN AUCTION SALE
// =============================================================================
// Everything the outcome depends on is read and written in ONE transaction, so
// there is no check-then-act gap. Exported so it can be tested on a real
// database; endAuction is the only caller.
//
// - THE LOT IS LOCKED AND CHECKED FIRST. It must still be IN_AUCTION with stock
//   left. Before this, settlement never looked: a seller accepting an older
//   pending bid mid-auction sold the lot, and the auction then sold it again
//   to its winner, two buyers and two deals for one lot. Bid accepts now refuse
//   an IN_AUCTION lot too, but this check is what makes a second sale
//   impossible whichever path got there first.
// - THE WINNER BUYS WHAT IS LEFT, remainingQuantity, not the quantity first
//   listed. Shoppers can buy part of a lot by the kilo before it goes to
//   auction, and the winner used to be billed for those kilos as well.
// - THE WINNER'S ROLE IS RE-READ UNDER A ROW LOCK (FOR UPDATE), not trusted
//   from the socket handshake, so a demotion racing settlement either commits
//   first and voids the sale or waits until the sale commits.
// - The winning bid, the SOLD flip and the escrow Transaction commit together,
//   so a settled auction never leaves a SOLD lot with no payable deal.
export type AuctionSettlement =
  | { outcome: 'sold'; bidId: string }
  | { outcome: 'voided' }
  | { outcome: 'gone' };

export async function settleAuctionSale(input: {
  listingId: string;
  winnerId: string;
  price: number;
  bidCount: number;
}): Promise<AuctionSettlement> {
  const { listingId, winnerId, price, bidCount } = input;
  return prisma.$transaction(async (tx): Promise<AuctionSettlement> => {
    // Lock the lot so nothing can change its status or stock until this
    // commits; whatever was read here is what gets sold.
    const locked = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "Listing" WHERE "id" = ${listingId} FOR UPDATE
    `;
    if (locked.length === 0) return { outcome: 'gone' };
    const listing = await tx.listing.findUniqueOrThrow({ where: { id: listingId } });
    if (listing.status !== 'IN_AUCTION' || !(listing.remainingQuantity > 0)) {
      return { outcome: 'gone' };
    }

    // Final authorization gate: never mint an ACCEPTED bid and an escrow deal
    // for somebody the REST layer would now refuse. An empty result means the
    // account was deleted mid-auction, treated as not a buyer.
    const lockedWinner = await tx.$queryRaw<Array<{ role: string }>>`
      SELECT "role"::text AS role FROM "User" WHERE "id" = ${winnerId} FOR UPDATE
    `;
    if (lockedWinner[0]?.role !== 'BUYER') {
      await tx.listing.update({ where: { id: listingId }, data: { status: 'ACTIVE' } });
      return { outcome: 'voided' };
    }

    const quantity = listing.remainingQuantity;
    const wb = await tx.bid.create({
      data: {
        listingId,
        buyerId: winnerId,
        bidPricePerUnit: price,
        quantity,
        totalAmount: price * quantity,
        currency: listing.currency,
        message: `Won via live auction (${bidCount} bids)`,
        // An auction bids on price alone, so delivery is on the lot's terms.
        freightPaidBy: listing.freightPaidBy,
        isAgentBid: false,
        status: 'ACCEPTED',
      },
    });
    await tx.listing.update({
      where: { id: listingId },
      data: { status: 'SOLD', remainingQuantity: 0 },
    });
    await createTransaction(wb.id, tx);
    return { outcome: 'sold', bidId: wb.id };
  });
}

// Put an auction's lot back on the market, only if it is still in an auction.
async function releaseAuctionLot(listingId: string): Promise<void> {
  await prisma.listing.updateMany({
    where: { id: listingId, status: 'IN_AUCTION' },
    data: { status: 'ACTIVE' },
  });
}

// =============================================================================
// RELEASE LOTS STRANDED BY A RESTART
// =============================================================================
// Live auctions are held in this process's memory, so a restart (every deploy
// is one) loses them: the bids, the clock and the timer that would end them.
// Their lots were left IN_AUCTION for good, where nothing can sell, relist or
// re-auction them. Called once at boot, before the server listens, when this
// process holds no auctions, so every IN_AUCTION lot is one a previous process
// abandoned. Each goes back on sale and its seller is told the auction was cut
// short and can be started again. Persisting auctions so they survive a
// restart is the real fix and is not built.
export async function releaseStrandedAuctions(): Promise<number> {
  const stranded = await prisma.listing.findMany({
    where: { status: 'IN_AUCTION' },
    select: { id: true, cropName: true, farmer: { select: { userId: true } } },
  });
  let released = 0;
  for (const lot of stranded) {
    if (activeAuctions.has(lot.id)) continue;
    const { count } = await prisma.listing.updateMany({
      where: { id: lot.id, status: 'IN_AUCTION' },
      data: { status: 'ACTIVE' },
    });
    if (count === 0) continue;
    released += 1;
    createNotification({
      userId: lot.farmer.userId,
      type: 'AUCTION_INTERRUPTED',
      title: 'Your auction was interrupted',
      message: `The live auction on your ${lot.cropName} stopped when CropBid restarted, so no sale was made. The lot is back on the market and you can start a new auction.`,
      data: { listingId: lot.id },
    }).catch(() => {});
  }
  return released;
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
    quantity: auction.quantity,
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
