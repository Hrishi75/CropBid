// =============================================================================
// AI Agent Service — Gemini API Integration
// =============================================================================
// WHY NATIVE FETCH INSTEAD OF AN SDK?
// The Gemini REST API is simple — one POST endpoint with a JSON body.
// Using native fetch() means:
//   - Zero dependencies (no @google/generative-ai package)
//   - Full control over request/response handling
//   - Easier to debug (you can see the exact HTTP request)
//   - No SDK version conflicts or breaking changes
//
// WHY GEMINI 1.5 FLASH?
// - Fastest model (~200ms response time vs ~2s for Pro)
// - Cheapest ($0.075/M input tokens — ~$0 for our use case)
// - Sufficient for structured negotiation decisions
// - Supports JSON output mode natively
//
// SAFETY:
// If anything goes wrong (API error, malformed response, rate limit),
// we default to "reject". This is the safest action because:
//   - No money changes hands
//   - No commitment is made
//   - The user can manually intervene
// =============================================================================

import { config } from '../config';
import {
  buildNegotiationPrompt,
  parseAgentResponse,
  type NegotiationContext,
  type AgentDecision,
} from '../utils/prompts';

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

// =============================================================================
// CALL GEMINI — Send prompt, get structured JSON response
// =============================================================================
// WHY A TIMEOUT?
// Without one, a hung socket holds the caller's HTTP request open forever.
// That was tolerable while the only caller was the negotiation engine (nobody
// is staring at it), but voice.service calls this with a farmer waiting on a
// spinner. 20s is well beyond Gemini Flash's normal sub-second latency, so it
// only ever fires on a genuinely stuck connection.
const GEMINI_TIMEOUT_MS = 20_000;

interface GeminiOptions {
  /** Cap on the reply. Raise it for prompts that return more than a decision. */
  maxOutputTokens?: number;
  temperature?: number;
}

export async function callGemini(prompt: string, options: GeminiOptions = {}): Promise<string> {
  if (!config.geminiApiKey) {
    throw new Error('GEMINI_API_KEY is not configured');
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const controller = new AbortController();
    timer = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);

    const response = await fetch(GEMINI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Send the API key via header so it never lands in access logs,
        // referrer headers, or error traces that include the request URL.
        'x-goog-api-key': config.geminiApiKey,
      },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: prompt }],
          },
        ],
        generationConfig: {
          // WHY temperature 0.3?
          // Low temperature = more deterministic responses.
          // In negotiations, we want consistent, predictable behavior.
          // High temperature would make the agent unpredictable — sometimes
          // accepting a price it rejected last time. That breaks trust.
          temperature: options.temperature ?? 0.3,

          // WHY maxOutputTokens 256?
          // Our JSON response is tiny (~100 tokens). 256 gives plenty of
          // room for the reasoning field without wasting tokens on rambling.
          // Callers extracting more fields pass a larger cap.
          maxOutputTokens: options.maxOutputTokens ?? 256,

          // Force JSON output — Gemini will structure its response as valid JSON
          responseMimeType: 'application/json',
        },
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error('Gemini API error:', response.status, errorBody);
      throw new Error(`Gemini API returned ${response.status}`);
    }

    const data = await response.json();

    // Extract the text from Gemini's response structure
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
      throw new Error('No text in Gemini response');
    }

    return text;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// =============================================================================
// GET AGENT DECISION — The main function called by the negotiation engine
// =============================================================================
// This is the single entry point for the negotiation system (Phase 9).
// It:
//   1. Builds the prompt from negotiation context
//   2. Calls Gemini API
//   3. Parses the response into a structured decision
//   4. Validates the decision against agent boundaries
//   5. Returns a safe, validated decision
// =============================================================================
export async function getAgentDecision(ctx: NegotiationContext): Promise<AgentDecision> {
  try {
    // Step 1: Build the prompt
    const prompt = buildNegotiationPrompt(ctx);

    // Step 2: Call Gemini
    const rawResponse = await callGemini(prompt);

    // Step 3: Parse response
    const decision = parseAgentResponse(rawResponse, ctx.currentBidPrice);

    // Step 4: Validate against boundaries
    const validated = validateDecision(decision, ctx);

    return validated;
  } catch (error) {
    console.error('AI Agent error:', error);

    // Safe fallback — reject on any failure
    return {
      action: 'reject',
      price: ctx.currentBidPrice,
      reasoning: 'AI agent encountered an error. Defaulting to reject for safety.',
    };
  }
}

// =============================================================================
// VALIDATE DECISION — Enforce hard boundaries
// =============================================================================
// The AI might hallucinate a price below the farmer's floor or above
// the buyer's ceiling. This function corrects those mistakes.
// It's a safety net — the AI should respect boundaries from the prompt,
// but we don't trust it blindly.
// =============================================================================
function validateDecision(decision: AgentDecision, ctx: NegotiationContext): AgentDecision {
  const isFarmer = ctx.agentRole === 'FARMER_AGENT';

  if (decision.action === 'counter') {
    if (isFarmer) {
      const floor = ctx.agentMinPrice || ctx.listingMinPrice;
      if (decision.price < floor) {
        // Correct: bump up to floor price
        decision.price = floor;
        decision.reasoning += ` (Price corrected to floor: ${floor})`;
      }
    } else {
      const ceiling = ctx.agentMaxPrice || ctx.listingMaxPrice;
      if (decision.price > ceiling) {
        // Correct: bring down to ceiling
        decision.price = ceiling;
        decision.reasoning += ` (Price corrected to ceiling: ${ceiling})`;
      }
    }
  }

  if (decision.action === 'accept') {
    if (isFarmer) {
      const floor = ctx.agentMinPrice || ctx.listingMinPrice;
      if (ctx.currentBidPrice < floor) {
        // Can't accept below floor — counter at floor instead
        return {
          action: 'counter',
          price: floor,
          reasoning: 'Cannot accept below floor price. Countering at minimum.',
        };
      }
    } else {
      const ceiling = ctx.agentMaxPrice || ctx.listingMaxPrice;
      if (ctx.currentBidPrice > ceiling) {
        // Can't accept above ceiling — counter at ceiling instead
        return {
          action: 'counter',
          price: ceiling,
          reasoning: 'Cannot accept above ceiling price. Countering at maximum.',
        };
      }
    }
    // Set the price for accepted bids
    decision.price = ctx.currentBidPrice;
  }

  return decision;
}

// =============================================================================
// CHECK AUTO-ACCEPT — Instant acceptance without AI call
// =============================================================================
// If the price is above the auto-accept threshold, skip the AI entirely.
// This is faster and saves API calls for obvious deals.
// =============================================================================
export function checkAutoAccept(
  price: number,
  threshold: number | null | undefined,
  agentRole: 'FARMER_AGENT' | 'BUYER_AGENT'
): AgentDecision | null {
  if (!threshold) return null;

  const isFarmer = agentRole === 'FARMER_AGENT';

  if (isFarmer && price >= threshold) {
    return {
      action: 'accept',
      price,
      reasoning: `Price ${price} exceeds auto-accept threshold of ${threshold}. Accepting immediately.`,
    };
  }

  if (!isFarmer && price <= threshold) {
    return {
      action: 'accept',
      price,
      reasoning: `Price ${price} is below auto-accept threshold of ${threshold}. Accepting immediately.`,
    };
  }

  return null;
}
