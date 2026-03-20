// =============================================================================
// Agent Config Service — AI Agent Settings Management
// =============================================================================
// Each user gets ONE AI agent. This service manages the agent's configuration:
//   - What price boundaries to respect
//   - What negotiation style to use (aggressive/balanced/conservative)
//   - Whether auto-negotiation is enabled
//   - Auto-accept threshold (instant acceptance above a price point)
//
// The agent config is created lazily — it doesn't exist until the user
// first visits the agent settings page. This avoids creating configs
// for users who never use the AI features.
// =============================================================================

import { prisma } from '../lib/prisma';
import { ApiError } from '../utils/ApiError';

interface UpdateAgentInput {
  autoNegotiate?: boolean;
  active?: boolean;
  minPrice?: number | null;
  maxPrice?: number | null;
  preferredCrops?: string[];
  qualityRequirements?: any;
  maxDistanceKm?: number | null;
  autoAcceptThreshold?: number | null;
  negotiationStyle?: string;
}

// =============================================================================
// GET OR CREATE — Lazily initialize agent config
// =============================================================================
export async function getAgentConfig(userId: string, role: string) {
  let config = await prisma.agentConfig.findUnique({
    where: { userId },
  });

  // Create default config if none exists
  if (!config) {
    config = await prisma.agentConfig.create({
      data: {
        userId,
        agentType: role === 'FARMER' ? 'FARMER_AGENT' : 'BUYER_AGENT',
        autoNegotiate: true,
        active: false, // Start inactive until user explicitly enables
        negotiationStyle: 'BALANCED',
        preferredCrops: [],
      },
    });
  }

  return config;
}

// =============================================================================
// UPDATE — Modify agent settings
// =============================================================================
export async function updateAgentConfig(userId: string, role: string, input: UpdateAgentInput) {
  // Ensure config exists first
  await getAgentConfig(userId, role);

  // Validate price boundaries
  if (role === 'FARMER' && input.minPrice !== undefined && input.minPrice !== null) {
    if (input.minPrice <= 0) {
      throw new ApiError(400, 'Minimum price must be greater than zero');
    }
  }

  if (role === 'BUYER' && input.maxPrice !== undefined && input.maxPrice !== null) {
    if (input.maxPrice <= 0) {
      throw new ApiError(400, 'Maximum price must be greater than zero');
    }
  }

  const config = await prisma.agentConfig.update({
    where: { userId },
    data: {
      ...(input.autoNegotiate !== undefined && { autoNegotiate: input.autoNegotiate }),
      ...(input.active !== undefined && { active: input.active }),
      ...(input.minPrice !== undefined && { minPrice: input.minPrice }),
      ...(input.maxPrice !== undefined && { maxPrice: input.maxPrice }),
      ...(input.preferredCrops !== undefined && { preferredCrops: input.preferredCrops }),
      ...(input.qualityRequirements !== undefined && { qualityRequirements: input.qualityRequirements }),
      ...(input.maxDistanceKm !== undefined && { maxDistanceKm: input.maxDistanceKm }),
      ...(input.autoAcceptThreshold !== undefined && { autoAcceptThreshold: input.autoAcceptThreshold }),
      ...(input.negotiationStyle !== undefined && { negotiationStyle: input.negotiationStyle as any }),
    },
  });

  return config;
}

// =============================================================================
// TOGGLE — Quick on/off switch for the agent
// =============================================================================
export async function toggleAgent(userId: string, role: string) {
  const config = await getAgentConfig(userId, role);

  const updated = await prisma.agentConfig.update({
    where: { userId },
    data: { active: !config.active },
  });

  return updated;
}
