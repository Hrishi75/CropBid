// Credit, in the words each side reads it in. The rules (amounts, repayment
// days, which uses each side may pick) come from GET /credit; this file only
// says them. CropBid does not lend: a person reads each application and, with
// the applicant's consent, takes it to a lending partner (CLAUDE.md §9).

export type CreditSide = 'BUYER' | 'SELLER';
export type CreditUse = 'STOCK' | 'CROP' | 'INPUTS' | 'EQUIPMENT' | 'GROW_BUSINESS';

export interface CreditRules {
  minAmount: number;
  maxAmount: number;
  repaymentDays: number[];
  uses: Record<CreditSide, CreditUse[]>;
}

export const USE_LABEL: Record<CreditUse, string> = {
  STOCK: 'Buy stock',
  CROP: 'Grow a crop',
  INPUTS: 'Seeds and fertiliser',
  EQUIPMENT: 'Equipment',
  GROW_BUSINESS: 'Grow the business',
};

/** The pitch and the form's wording, by the side applying. */
export const SIDE_WORDS: Record<CreditSide, {
  pitchTitle: string;
  pitchBody: string;
  pageTitle: [string, string];
  nameLabel: string;
  monthlyLabel: string;
  monthlyPlaceholder: string;
}> = {
  BUYER: {
    pitchTitle: 'Need money to stock up?',
    pitchBody: 'Buy produce now and repay later. Tell us about your business and we take it to a lending partner.',
    pageTitle: ['Money to stock up,', 'repaid later.'],
    nameLabel: 'Business name',
    monthlyLabel: 'Produce you buy in a month, roughly (₹)',
    monthlyPlaceholder: '400000',
  },
  SELLER: {
    pitchTitle: 'Need money to grow?',
    pitchBody: 'For a new crop, seeds and fertiliser, equipment, or a bigger business, repaid after the harvest if you need. Tell us what you need and we take it to a lending partner.',
    pageTitle: ['Money to grow,', 'repaid later.'],
    nameLabel: 'Your farm or business name',
    monthlyLabel: 'What you sell in a month, roughly (₹)',
    monthlyPlaceholder: '150000',
  },
};
