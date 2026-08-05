// =============================================================================
// translation.service tests — the skip rules and the never-throw contract
// =============================================================================
// The expensive mistakes this feature can make are all "called Sarvam when it
// shouldn't have" or "threw where nobody was listening", so that is what these
// cover: every branch that avoids a paid call, and the guarantee that a failure
// anywhere leaves the caller's request untouched.
// =============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../lib/prisma', () => ({
  prisma: {
    listing: { findUnique: vi.fn(), updateMany: vi.fn() },
    buyerRequirement: { findUnique: vi.fn(), updateMany: vi.fn() },
  },
}));

vi.mock('./sarvam.service', () => ({ translate: vi.fn() }));

import { prisma } from '../lib/prisma';
import { translate } from './sarvam.service';
import {
  translateListingNow,
  translateRequirementNow,
  queueListingTranslation,
  flushTranslationQueue,
} from './translation.service';

const findListing = vi.mocked(prisma.listing.findUnique);
const updateListing = vi.mocked(prisma.listing.updateMany);
const findRequirement = vi.mocked(prisma.buyerRequirement.findUnique);
const translateMock = vi.mocked(translate);

// A listing row as the service selects it: no translations yet, English text,
// authored by a user with no explicit language preference.
function listingRow(overrides: Record<string, unknown> = {}) {
  return {
    description: 'Fresh onions from Nashik',
    descriptionEn: null,
    descriptionHi: null,
    descriptionMr: null,
    descriptionLang: null,
    farmer: { user: { language: 'EN' } },
    ...overrides,
  } as never;
}

let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  errorSpy.mockRestore();
});

describe('translateListingNow — skip rules', () => {
  it('does nothing when the listing is gone', async () => {
    findListing.mockResolvedValue(null as never);

    await translateListingNow('missing');

    expect(translateMock).not.toHaveBeenCalled();
    expect(updateListing).not.toHaveBeenCalled();
  });

  it('skips a blank description without calling Sarvam', async () => {
    findListing.mockResolvedValue(listingRow({ description: '   ' }));

    await translateListingNow('l1');

    expect(translateMock).not.toHaveBeenCalled();
    expect(updateListing).not.toHaveBeenCalled();
  });

  it('skips text over 2000 chars rather than truncating it', async () => {
    findListing.mockResolvedValue(listingRow({ description: 'a'.repeat(2001) }));

    await translateListingNow('l1');

    // Truncating would misstate the seller's terms; the buyer sees the
    // original instead.
    expect(translateMock).not.toHaveBeenCalled();
    expect(updateListing).not.toHaveBeenCalled();
  });

  it('skips text in a script we do not support', async () => {
    findListing.mockResolvedValue(listingRow({ description: 'புதிய வெங்காயம்' }));

    await translateListingNow('l1');

    expect(translateMock).not.toHaveBeenCalled();
  });

  it('skips a row that is already translated (idempotence)', async () => {
    // The source column holding an exact copy IS the done marker.
    findListing.mockResolvedValue(
      listingRow({
        description: 'Fresh onions from Nashik',
        descriptionEn: 'Fresh onions from Nashik',
        descriptionLang: 'EN',
      }),
    );

    await translateListingNow('l1');

    expect(translateMock).not.toHaveBeenCalled();
    expect(updateListing).not.toHaveBeenCalled();
  });

  it('re-translates when the description has been edited since', async () => {
    findListing.mockResolvedValue(
      listingRow({
        description: 'Now selling garlic instead',
        descriptionEn: 'Fresh onions from Nashik',
        descriptionLang: 'EN',
      }),
    );
    translateMock.mockResolvedValue('अनुवाद');

    await translateListingNow('l1');

    expect(translateMock).toHaveBeenCalled();
  });
});

describe('translateListingNow — writes', () => {
  it('fills the source column for free and translates into the other two', async () => {
    findListing.mockResolvedValue(listingRow());
    translateMock.mockImplementation(async (_text, _src, target) =>
      target === 'hi-IN' ? 'हिंदी अनुवाद' : 'मराठी अनुवाद',
    );

    await translateListingNow('l1');

    // Source column is a copy of the original — no API call spent on it.
    expect(translateMock).toHaveBeenCalledTimes(2);
    expect(updateListing).toHaveBeenCalledWith({
      // Conditional on the description we translated, not just the id.
      where: { id: 'l1', description: 'Fresh onions from Nashik' },
      data: {
        descriptionLang: 'EN',
        descriptionEn: 'Fresh onions from Nashik',
        descriptionHi: 'हिंदी अनुवाद',
        descriptionMr: 'मराठी अनुवाद',
      },
    });
  });

  it('matches on the RAW stored description, not the trimmed one', async () => {
    // createListing runs no zod, so descriptions reach the DB with whatever
    // whitespace the textarea produced. If the compare-and-swap matched on the
    // trimmed text it would find zero rows and these listings would stay
    // untranslated forever, with every retry repeating the same mismatch.
    findListing.mockResolvedValue(listingRow({ description: '  Fresh onions from Nashik\n' }));
    translateMock.mockResolvedValue('अनुवाद');
    updateListing.mockResolvedValue({ count: 1 } as never);

    await translateListingNow('l1');

    const call = updateListing.mock.calls[0][0];
    expect((call.where as Record<string, unknown>).description).toBe('  Fresh onions from Nashik\n');
    // ...while the text we translated and store is the trimmed version.
    expect((call.data as Record<string, unknown>).descriptionEn).toBe('Fresh onions from Nashik');
    expect(translateMock).toHaveBeenCalledWith('Fresh onions from Nashik', 'en-IN', expect.any(String));
  });

  it('guards the write against an edit that landed mid-translation', async () => {
    // The farmer edits while Sarvam is still working. The write must be
    // conditional on the ORIGINAL text, so it matches zero rows rather than
    // stapling a translation of withdrawn terms onto the new description.
    findListing.mockResolvedValue(listingRow({ description: 'Fresh onions from Nashik' }));
    translateMock.mockResolvedValue('अनुवाद');
    updateListing.mockResolvedValue({ count: 0 } as never);

    await translateListingNow('l1');

    const where = updateListing.mock.calls[0][0].where as Record<string, unknown>;
    expect(where.description).toBe('Fresh onions from Nashik');
    // Matching 0 rows is a correct, silent outcome — the edit re-queued a job.
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('writes only the columns that succeeded when one translation fails', async () => {
    findListing.mockResolvedValue(listingRow());
    translateMock.mockImplementation(async (_text, _src, target) =>
      target === 'hi-IN' ? 'हिंदी अनुवाद' : null,
    );

    await translateListingNow('l1');

    const data = updateListing.mock.calls[0][0].data as Record<string, unknown>;
    expect(data.descriptionHi).toBe('हिंदी अनुवाद');
    // A partial result is valid — never write null over a column a previous
    // run may have populated.
    expect(data).not.toHaveProperty('descriptionMr');
  });

  it('uses the author preference to tell Marathi from Hindi', async () => {
    findListing.mockResolvedValue(
      listingRow({
        description: 'नाशिकहून ताजे कांदे',
        farmer: { user: { language: 'MR' } },
      }),
    );
    translateMock.mockResolvedValue('translated');

    await translateListingNow('l1');

    const data = updateListing.mock.calls[0][0].data as Record<string, unknown>;
    expect(data.descriptionLang).toBe('MR');
    expect(data.descriptionMr).toBe('नाशिकहून ताजे कांदे');
    // Both source codes must be mr-IN, never hi-IN.
    expect(translateMock.mock.calls.every(([, src]) => src === 'mr-IN')).toBe(true);
  });

  it('defaults Devanagari to Hindi when the author has no preference', async () => {
    findListing.mockResolvedValue(
      listingRow({ description: 'नाशिक से ताज़ा प्याज़', farmer: { user: { language: null } } }),
    );
    translateMock.mockResolvedValue('translated');

    await translateListingNow('l1');

    expect((updateListing.mock.calls[0][0].data as Record<string, unknown>).descriptionLang).toBe('HI');
  });
});

describe('never throws', () => {
  it('swallows a prisma read failure', async () => {
    findListing.mockRejectedValue(new Error('connection lost') as never);

    await expect(translateListingNow('l1')).resolves.toBeUndefined();
  });

  it('swallows a prisma write failure', async () => {
    findListing.mockResolvedValue(listingRow());
    translateMock.mockResolvedValue('x');
    updateListing.mockRejectedValue(new Error('write conflict') as never);

    await expect(translateListingNow('l1')).resolves.toBeUndefined();
  });

  it('swallows a requirement read failure', async () => {
    findRequirement.mockRejectedValue(new Error('boom') as never);

    await expect(translateRequirementNow('r1')).resolves.toBeUndefined();
  });
});

describe('queueListingTranslation', () => {
  it('returns void immediately and runs the work afterwards', async () => {
    findListing.mockResolvedValue(listingRow());
    translateMock.mockResolvedValue('translated');

    // Synchronous return is the contract — controllers call this after
    // res.json() and must not be slowed down by it.
    expect(queueListingTranslation('l1')).toBeUndefined();
    expect(updateListing).not.toHaveBeenCalled();

    await flushTranslationQueue();
    expect(updateListing).toHaveBeenCalled();
  });

  it('runs queued jobs serially, so only one Sarvam call is in flight', async () => {
    findListing.mockResolvedValue(listingRow());
    let inFlight = 0;
    let maxInFlight = 0;
    translateMock.mockImplementation(async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 1));
      inFlight -= 1;
      return 'translated';
    });

    queueListingTranslation('l1');
    queueListingTranslation('l2');
    queueListingTranslation('l3');
    await flushTranslationQueue();

    expect(maxInFlight).toBe(1);
  });

  it('keeps draining after one job fails', async () => {
    findListing
      .mockRejectedValueOnce(new Error('boom') as never)
      .mockResolvedValue(listingRow());
    translateMock.mockResolvedValue('translated');

    queueListingTranslation('bad');
    queueListingTranslation('good');
    await flushTranslationQueue();

    // A poisoned chain would silently stop translating everything after the
    // first error, which is the kind of bug nobody notices for a month.
    expect(updateListing).toHaveBeenCalledTimes(1);
  });
});
