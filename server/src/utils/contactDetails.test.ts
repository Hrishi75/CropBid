// =============================================================================
// Names only, CropBid in the middle (2026-11-02)
// =============================================================================
//   - text the other side reads may not carry a phone number, an email or a
//     chat link, written plainly or dressed up
//   - ordinary trade text (prices, quantities, dates) is not caught by it
//   - a wholesaler's firm name and free-text location are blanked on trade
//     responses, while a household shop keeps its shop name
// =============================================================================

import { describe, it, expect } from 'vitest';
import { assertNoContactDetails, findContactDetail } from './contactDetails';
import { nameOnlySellers } from '../services/publicSeller';

describe('contact details in text', () => {
  it.each([
    ['call me 9876543210', 'phone'],
    ['+91 98765 43210 anytime', 'phone'],
    ['ph: 98765-43210', 'phone'],
    ['09876543210', 'phone'],
    ['mail ramesh.patil@gmail.com', 'email'],
    ['ramesh (at) gmail (dot) com', 'email'],
    ['wa.me/919876543210', 'phone'],
    ['https://chat.whatsapp.com/AbCdEf', 'link'],
  ])('finds it in %j', (text, kind) => {
    expect(findContactDetail(text)).toBe(kind);
  });

  it.each([
    'Need 50 quintal by 12/11/2026, grade A',
    'Price ₹2,450 per quintal, 1,00,000 kg total',
    'Moisture under 12%, packed in 50 kg bags',
    'Lot 4521 from Wardha APMC',
    '',
  ])('leaves ordinary trade text alone: %j', (text) => {
    expect(findContactDetail(text)).toBeNull();
  });

  it('refuses with a 400 that points at CropBid', () => {
    expect(() => assertNoContactDetails('call 9876543210')).toThrow(/6362953105/);
    try {
      assertNoContactDetails('x@y.com', 'The description');
    } catch (e: any) {
      expect(e.statusCode).toBe(400);
      expect(e.code).toBe('CONTACT_DETAILS_NOT_ALLOWED');
      expect(e.message).toMatch(/^The description contains an email address/);
    }
  });
});

describe('nameOnlySellers', () => {
  const seller = (sellerType: string) => ({
    id: 'p1',
    sellerType,
    businessName: 'Patil Traders',
    shopType: 'KIRANA',
    user: { id: 'u1', name: 'Ramesh Patil', location: '12 Station Road, Wardha' },
  });

  it("blanks a wholesaler's firm name and free-text location, keeping the person's name", () => {
    const out = nameOnlySellers({ listings: [{ id: 'l1', location: 'Wardha', farmer: seller('WHOLESALER') }] });
    const f = out.listings[0].farmer;
    expect(f.businessName).toBeNull();
    expect(f.user.location).toBeNull();
    expect(f.user.name).toBe('Ramesh Patil');
    // The lot's own town is where the crop is, not a way to reach anyone.
    expect(out.listings[0].location).toBe('Wardha');
  });

  it('keeps a household shop its shop name', () => {
    const out = nameOnlySellers({ farmer: seller('LOCAL_SHOP') });
    expect(out.farmer.businessName).toBe('Patil Traders');
  });

  it('leaves dates and other values alone', () => {
    const when = new Date('2026-11-02T00:00:00Z');
    const out = nameOnlySellers({ createdAt: when, n: 3, list: ['a'] });
    expect(out.createdAt).toBe(when);
    expect(out).toMatchObject({ n: 3, list: ['a'] });
  });
});
