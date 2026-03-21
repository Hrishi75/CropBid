// =============================================================================
// Negotiation Service — AI-Powered Automated Negotiation Engine
// =============================================================================
// THE STATE MACHINE:
// A negotiation is a back-and-forth between two AI agents. Each round:
//   1. One agent makes a decision (accept / reject / counter)
//   2. The decision is logged as a "round" in the JSON array
//   3. If accept → outcome = DEAL, listing sold, bid accepted
//   4. If reject → outcome = NO_DEAL
//   5. If counter → the other agent takes its turn
//   6. If max rounds reached with no agreement → outcome = NO_DEAL
//
// WHY RUN ALL ROUNDS AT ONCE?
// In a real production app, you might run each round with a delay (for UX drama).
// But for Phase 9, we run the entire negotiation in one request. The client
// polls or receives the final result. In Phase 10, Socket.io will let us
// stream rounds in real-time.
//
// THE ALTERNATING PATTERN:
//   Round 1: Buyer's bid → Farmer agent responds
//   Round 2: If countered → Buyer agent responds to counter
//   Round 3: Farmer agent responds to buyer's counter
//   ...continues until accept, reject, or max rounds
// =============================================================================

import { prisma } from '../lib/prisma';
import { ApiError } from '../utils/ApiError';
import { getAgentDecision, checkAutoAccept } from './aiAgent';
import type { NegotiationContext } from '../utils/prompts';

const MAX_ROUNDS = 6; // Max back-and-forth rounds

// =============================================================================
// Round log entry — stored in the JSON `rounds` column
// =============================================================================
interface RoundEntry {
  round: number;
  from: 'farmer_agent' | 'buyer_agent';
  action: 'accept' | 'reject' | 'counter';
  price: number;
  reasoning: string;
  timestamp: string;
}

// =============================================================================
// START NEGOTIATION — Kicks off AI agent negotiation for a bid
// =============================================================================
export async function startNegotiation(bidId: string, userId: string) {
  // Load the bid with all related data
  const bid = await prisma.bid.findUnique({
    where: { id: bidId },
    include: {
      listing: {
        include: {
          farmer: {
            include: { user: { select: { id: true, name: true, trustScore: true } } },
          },
        },
      },
      buyer: { select: { id: true, name: true, trustScore: true } },
    },
  });

  if (!bid) throw new ApiError(404, 'Bid not found');
  if (bid.status !== 'PENDING') {
    throw new ApiError(400, `Cannot negotiate a ${bid.status.toLowerCase()} bid`);
  }

  // Verify the user is either the farmer or buyer for this bid
  const isFarmer = bid.listing.farmer.userId === userId;
  const isBuyer = bid.buyerId === userId;
  if (!isFarmer && !isBuyer) {
    throw new ApiError(403, 'You are not involved in this bid');
  }

  // Check if both parties have agent configs
  const farmerConfig = await prisma.agentConfig.findUnique({
    where: { userId: bid.listing.farmer.userId },
  });
  const buyerConfig = await prisma.agentConfig.findUnique({
    where: { userId: bid.buyerId },
  });

  if (!farmerConfig || !farmerConfig.active) {
    throw new ApiError(400, "Farmer's AI agent is not configured or inactive");
  }
  if (!buyerConfig || !buyerConfig.active) {
    throw new ApiError(400, "Buyer's AI agent is not configured or inactive");
  }

  // Check for existing negotiation on this bid
  const existing = await prisma.negotiation.findUnique({
    where: { bidId },
  });
  if (existing) {
    throw new ApiError(400, 'A negotiation already exists for this bid');
  }

  // Create the negotiation record
  const negotiation = await prisma.negotiation.create({
    data: {
      listingId: bid.listingId,
      bidId: bid.id,
      farmerAgentId: farmerConfig.id,
      buyerAgentId: buyerConfig.id,
      rounds: [],
      finalOutcome: 'IN_PROGRESS',
    },
  });

  // Run the negotiation engine
  const result = await runNegotiation(
    negotiation.id,
    bid,
    farmerConfig,
    buyerConfig
  );

  return result;
}

// =============================================================================
// RUN NEGOTIATION — The core engine that alternates between agents
// =============================================================================
async function runNegotiation(
  negotiationId: string,
  bid: any,
  farmerConfig: any,
  buyerConfig: any
) {
  const rounds: RoundEntry[] = [];
  let currentPrice = bid.bidPricePerUnit;
  let outcome: 'DEAL' | 'NO_DEAL' | 'IN_PROGRESS' = 'IN_PROGRESS';

  // Round 1 starts with the farmer agent responding to the buyer's initial bid
  let currentTurn: 'farmer_agent' | 'buyer_agent' = 'farmer_agent';

  for (let roundNum = 1; roundNum <= MAX_ROUNDS; roundNum++) {
    const isFarmerTurn: boolean = currentTurn === 'farmer_agent';
    const activeConfig = isFarmerTurn ? farmerConfig : buyerConfig;
    const agentRole = isFarmerTurn ? 'FARMER_AGENT' : 'BUYER_AGENT';

    // Check auto-accept first (skips AI call)
    const autoDecision = checkAutoAccept(
      currentPrice,
      activeConfig.autoAcceptThreshold,
      agentRole as 'FARMER_AGENT' | 'BUYER_AGENT'
    );

    let decision;
    if (autoDecision) {
      decision = autoDecision;
    } else {
      // Build context for the AI agent
      const ctx: NegotiationContext = {
        agentRole: agentRole as 'FARMER_AGENT' | 'BUYER_AGENT',
        negotiationStyle: activeConfig.negotiationStyle,
        cropName: bid.listing.cropName,
        cropVariety: bid.listing.cropVariety,
        quantity: bid.quantity,
        unit: bid.listing.unit,
        qualityGrade: bid.listing.qualityGrade,
        organic: bid.listing.organic,
        listingMinPrice: bid.listing.pricePerUnitMin,
        listingMaxPrice: bid.listing.pricePerUnitMax,
        currency: bid.currency,
        agentMinPrice: farmerConfig.minPrice,
        agentMaxPrice: buyerConfig.maxPrice,
        autoAcceptThreshold: activeConfig.autoAcceptThreshold,
        currentBidPrice: currentPrice,
        roundNumber: roundNum,
        maxRounds: MAX_ROUNDS,
        previousRounds: rounds.map(r => ({
          round: r.round,
          from: r.from,
          action: r.action,
          price: r.price,
          reasoning: r.reasoning,
        })),
        counterpartyName: isFarmerTurn
          ? bid.buyer.name
          : bid.listing.farmer.user.name,
        counterpartyTrustScore: isFarmerTurn
          ? bid.buyer.trustScore
          : bid.listing.farmer.user.trustScore,
      };

      decision = await getAgentDecision(ctx);
    }

    // Log this round
    const round: RoundEntry = {
      round: roundNum,
      from: currentTurn,
      action: decision.action,
      price: decision.price,
      reasoning: decision.reasoning,
      timestamp: new Date().toISOString(),
    };
    rounds.push(round);

    // Handle the decision
    if (decision.action === 'accept') {
      outcome = 'DEAL';
      currentPrice = decision.price;
      break;
    } else if (decision.action === 'reject') {
      outcome = 'NO_DEAL';
      break;
    } else {
      // Counter — update the price and switch turns
      currentPrice = decision.price;
      currentTurn = currentTurn === 'farmer_agent' ? 'buyer_agent' : 'farmer_agent';
    }
  }

  // If we exhausted all rounds without a deal
  if (outcome === 'IN_PROGRESS') {
    outcome = 'NO_DEAL';
    rounds.push({
      round: rounds.length + 1,
      from: 'farmer_agent',
      action: 'reject',
      price: currentPrice,
      reasoning: 'Maximum negotiation rounds reached without agreement.',
      timestamp: new Date().toISOString(),
    });
  }

  // Update the negotiation record with results
  const updated = await prisma.negotiation.update({
    where: { id: negotiationId },
    data: {
      rounds: rounds as any,
      finalOutcome: outcome,
      endedAt: new Date(),
    },
    include: {
      listing: {
        include: {
          farmer: {
            include: { user: { select: { id: true, name: true } } },
          },
        },
      },
      bid: {
        include: {
          buyer: { select: { id: true, name: true, trustScore: true } },
        },
      },
    },
  });

  // If deal was reached, accept the bid and mark listing as sold
  if (outcome === 'DEAL') {
    await prisma.$transaction([
      prisma.bid.update({
        where: { id: bid.id },
        data: {
          status: 'ACCEPTED',
          bidPricePerUnit: currentPrice,
          totalAmount: currentPrice * bid.quantity,
          isAgentBid: true,
        },
      }),
      // Reject competing bids
      prisma.bid.updateMany({
        where: {
          listingId: bid.listingId,
          id: { not: bid.id },
          status: { in: ['PENDING', 'COUNTERED'] },
        },
        data: { status: 'REJECTED' },
      }),
      // Mark listing as sold
      prisma.listing.update({
        where: { id: bid.listingId },
        data: { status: 'SOLD' },
      }),
    ]);
  } else {
    // No deal — reject the bid
    await prisma.bid.update({
      where: { id: bid.id },
      data: { status: 'REJECTED' },
    });
  }

  return updated;
}

// =============================================================================
// GET NEGOTIATION — View a specific negotiation
// =============================================================================
export async function getNegotiation(negotiationId: string, userId: string) {
  const negotiation = await prisma.negotiation.findUnique({
    where: { id: negotiationId },
    include: {
      listing: {
        include: {
          farmer: {
            include: { user: { select: { id: true, name: true, trustScore: true } } },
          },
        },
      },
      bid: {
        include: {
          buyer: { select: { id: true, name: true, trustScore: true } },
        },
      },
      farmerAgent: true,
      buyerAgent: true,
    },
  });

  if (!negotiation) throw new ApiError(404, 'Negotiation not found');

  // Verify user is involved
  const farmerId = negotiation.listing.farmer.userId;
  const buyerId = negotiation.bid.buyerId;
  if (userId !== farmerId && userId !== buyerId) {
    throw new ApiError(403, 'You are not involved in this negotiation');
  }

  return negotiation;
}

// =============================================================================
// GET MY NEGOTIATIONS — List all negotiations for a user
// =============================================================================
export async function getMyNegotiations(userId: string, role: string) {
  // Find negotiations where the user is either the farmer or buyer
  const where: any = {};

  if (role === 'FARMER') {
    const farmerProfile = await prisma.farmerProfile.findUnique({
      where: { userId },
    });
    if (!farmerProfile) throw new ApiError(400, 'Farmer profile not found');
    where.listing = { farmerId: farmerProfile.id };
  } else {
    where.bid = { buyerId: userId };
  }

  const negotiations = await prisma.negotiation.findMany({
    where,
    orderBy: { startedAt: 'desc' },
    include: {
      listing: {
        include: {
          farmer: {
            include: { user: { select: { id: true, name: true } } },
          },
        },
      },
      bid: {
        include: {
          buyer: { select: { id: true, name: true, trustScore: true } },
        },
      },
    },
  });

  return negotiations;
}

// =============================================================================
// GET NEGOTIATION BY BID — Find negotiation for a specific bid
// =============================================================================
export async function getNegotiationByBid(bidId: string, userId: string) {
  const negotiation = await prisma.negotiation.findUnique({
    where: { bidId },
    include: {
      listing: {
        include: {
          farmer: {
            include: { user: { select: { id: true, name: true, trustScore: true } } },
          },
        },
      },
      bid: {
        include: {
          buyer: { select: { id: true, name: true, trustScore: true } },
        },
      },
      farmerAgent: true,
      buyerAgent: true,
    },
  });

  if (!negotiation) throw new ApiError(404, 'No negotiation found for this bid');

  const farmerId = negotiation.listing.farmer.userId;
  const buyerId = negotiation.bid.buyerId;
  if (userId !== farmerId && userId !== buyerId) {
    throw new ApiError(403, 'You are not involved in this negotiation');
  }

  return negotiation;
}
