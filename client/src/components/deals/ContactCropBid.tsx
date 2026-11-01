// "Need to reach the buyer? Call or WhatsApp CropBid": shown wherever the
// other side's phone used to be. The two sides see names only; CropBid is
// the point of contact (content/support.ts).

import { CROPBID_CONTACT_DISPLAY, CROPBID_TEL_HREF, cropbidWhatsAppHref } from '../../content/support';

interface Props {
  /** Who they might want to reach: "the buyer", "the seller". */
  other: string;
  /** Typed into the WhatsApp chat, e.g. the deal reference. */
  about?: string;
}

export function ContactCropBid({ other, about }: Props) {
  return (
    <div className="cb-small" style={{ padding: 10, background: 'var(--cb-paper-2)', borderRadius: 6, color: 'var(--cb-ink-2)' }}>
      Need to reach {other}? CropBid handles it: call{' '}
      <a href={CROPBID_TEL_HREF} style={{ color: 'var(--cb-ink)', fontWeight: 600 }}>{CROPBID_CONTACT_DISPLAY}</a>
      {' '}or{' '}
      <a
        href={cropbidWhatsAppHref(about ? `Hi CropBid, about ${about}: ` : undefined)}
        target="_blank"
        rel="noopener noreferrer"
        style={{ color: 'var(--cb-ink)', fontWeight: 600 }}
      >
        WhatsApp us
      </a>.
    </div>
  );
}
