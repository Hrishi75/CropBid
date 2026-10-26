// Credit, in the words each side reads it in. The same words as the website's
// client/src/utils/credit.ts; the rules themselves (amounts, repayment days,
// which uses each side may pick) come from GET /credit. CropBid does not lend:
// a person reads each application and, with consent, takes it to a lending
// partner (CLAUDE.md §9).
import type { CreditSide, CreditUse } from '../api/types';

export const USE_LABEL: Record<CreditUse, string> = {
  STOCK: 'Buy stock',
  CROP: 'Grow a crop',
  INPUTS: 'Seeds and fertiliser',
  EQUIPMENT: 'Equipment',
  GROW_BUSINESS: 'Grow the business',
};

export const SIDE_WORDS: Record<CreditSide, {
  pitchTitle: string;
  pitchBody: string;
  intro: string;
  nameLabel: string;
  namePlaceholder: string;
  monthlyLabel: string;
  monthlyPlaceholder: string;
  moreLabel: string;
  morePlaceholder: string;
}> = {
  BUYER: {
    pitchTitle: 'Need money to stock up?',
    pitchBody: 'Buy produce now and repay later. Tell us about your business and we take it to a lending partner.',
    intro: 'Tell us about your business. A person reads every application and, with your permission, takes it to a lending partner. CropBid does not lend money.',
    nameLabel: 'Business name',
    namePlaceholder: 'Vikram Foods',
    monthlyLabel: 'Produce you buy in a month, roughly (₹)',
    monthlyPlaceholder: '4,00,000',
    moreLabel: 'What will you buy with it? (optional)',
    morePlaceholder: 'Onion for the dehydration line, stocking up before the season…',
  },
  SELLER: {
    pitchTitle: 'Need money to grow?',
    pitchBody: 'For a new crop, seeds and fertiliser, equipment, or a bigger business, repaid after the harvest if you need. Tell us what you need and we take it to a lending partner.',
    intro: 'Tell us what you need. A person reads every application and, with your permission, takes it to a lending partner. CropBid does not lend money.',
    nameLabel: 'Your farm or business name',
    namePlaceholder: 'Patil Farms',
    monthlyLabel: 'What you sell in a month, roughly (₹)',
    monthlyPlaceholder: '1,50,000',
    moreLabel: 'Tell us more: which crop, what equipment (optional)',
    morePlaceholder: 'Soybean for the kharif season, a drip line for two acres…',
  },
};
