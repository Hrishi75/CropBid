// =============================================================================
// Equipment screen — machines, pumps and pipes to buy or hire
// =============================================================================
// A lead-gen catalogue, not a shop. Farmers filter by category and by whether
// they want to BUY or HIRE, open a card for the spec sheet, then raise an
// enquiry — which is what unlocks the dealer's phone number and hands the lead
// over. CropBid never takes payment for machinery; the dealer closes offline.
//
// WHY THE BUY / HIRE TOGGLE LEADS
// It's the first question a farmer actually has. A ₹7.8L tractor is out of
// reach for a smallholder who will happily pay ₹1,400/day at sowing time, so
// the same machine shows a sale price to one farmer and a day rate to another.
// Listings marked BOTH answer to either filter.
//
// Layout follows SchemesScreen: search + chips pinned on top, tap-to-expand
// cards below, since both are "browse a curated catalogue" surfaces.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Linking, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import api, { errorMessage } from '../api/client';
import { IconSearch } from '../components/icons';
import { Mono } from '../components/buyerKit';
import { PressScale, glide } from '../components/motion';
import { useAuth } from '../context/AuthContext';
import { money } from '../lib/format';
import { colors, design, font } from '../theme';

// --- data shapes (mirror server/src/services/equipment.service.ts) ---

interface Dealer {
  id: string;
  name: string;
  location: string;
  state: string;
  verified: boolean;
  rating: number;
  smamEmpanelled: boolean;
  // Present only in the enquiry response — never on browse/detail.
  contactPhone?: string;
  contactEmail?: string | null;
}

interface Equipment {
  id: string;
  title: string;
  category: string;
  brand?: string | null;
  modelName?: string | null;
  condition: 'NEW' | 'USED';
  yearMade?: number | null;
  mode: 'SALE' | 'RENT' | 'BOTH';
  salePrice?: number | null;
  rentPricePerDay?: number | null;
  rentPricePerHour?: number | null;
  securityDeposit?: number | null;
  currency: string;
  powerHp?: number | null;
  specs: string[];
  description?: string | null;
  location: string;
  state: string;
  dealer: Dealer;
}

interface CategoryMeta {
  id: string;
  label: string;
  count: number;
}

type Intent = 'SALE' | 'RENT';

// Category emoji — purely decorative, keeps the list scannable at a glance the
// way SchemesScreen uses per-scheme emoji.
const CATEGORY_EMOJI: Record<string, string> = {
  TRACTOR: '🚜',
  TILLAGE: '⛏️',
  HARVESTER: '🌾',
  IRRIGATION: '💧',
  SPRAYER: '🪣',
  THRESHER: '🌿',
  POWER: '⚙️',
  TOOLS: '🔧',
};

// The headline price depends on what the farmer is shopping for. A BOTH
// listing under the HIRE filter must lead with its day rate, not its sale
// price, or the farmer reads "₹7,85,000" and bounces off a machine they could
// have rented for ₹1,400.
function priceLine(e: Equipment, intent: Intent): string {
  if (intent === 'RENT') {
    if (e.rentPricePerDay) return `${money(e.rentPricePerDay, e.currency)}/day`;
    if (e.rentPricePerHour) return `${money(e.rentPricePerHour, e.currency)}/hour`;
    return 'Ask dealer';
  }
  return e.salePrice ? money(e.salePrice, e.currency) : 'Ask dealer';
}

export default function EquipmentScreen() {
  const { t } = useTranslation();
  const { user } = useAuth();

  const [items, setItems] = useState<Equipment[] | null>(null);
  const [categories, setCategories] = useState<CategoryMeta[]>([]);
  const [failed, setFailed] = useState(false);

  const [intent, setIntent] = useState<Intent>('SALE');
  const [cat, setCat] = useState('');
  const [q, setQ] = useState('');

  const [open, setOpen] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  // Dealer contacts unlocked this session, keyed by equipment id. Populated
  // only by a successful enquiry — see the service's contact rule.
  const [unlocked, setUnlocked] = useState<Record<string, Dealer>>({});

  // Category counts come from real stock, so empty categories never show up.
  useEffect(() => {
    let on = true;
    api.get('/equipment/meta')
      .then(({ data }) => { if (on) setCategories(data.categories.filter((c: CategoryMeta) => c.count > 0)); })
      .catch(() => { /* chips are optional — the list still works without them */ });
    return () => { on = false; };
  }, []);

  // Mode and category filter server-side; the free-text box filters locally so
  // typing stays instant on a slow rural connection.
  useEffect(() => {
    let on = true;
    setItems(null);
    setFailed(false);
    api.get('/equipment', { params: { mode: intent, category: cat || undefined, limit: 50 } })
      .then(({ data }) => { if (on) { glide(); setItems(data.equipment); } })
      .catch(() => { if (on) setFailed(true); });
    return () => { on = false; };
  }, [intent, cat]);

  const results = useMemo(() => {
    if (!items) return [];
    const needle = q.trim().toLowerCase();
    if (!needle) return items;
    return items.filter((e) =>
      [e.title, e.brand, e.modelName, e.location, e.dealer.name]
        .filter(Boolean).join(' ').toLowerCase().includes(needle)
    );
  }, [items, q]);

  const enquire = useCallback(async (e: Equipment) => {
    if (!user) {
      Alert.alert(
        t('Sign in to continue'),
        t("Raising an enquiry shares your name with the dealer so they can call you back.")
      );
      return;
    }
    setSending(true);
    try {
      // A BOTH listing needs the intent spelled out; for SALE/RENT-only rows
      // the server would reject a mismatched intent, so send what's on offer.
      const askFor: Intent = e.mode === 'BOTH' ? intent : (e.mode as Intent);
      const { data } = await api.post(`/equipment/${e.id}/enquiry`, {
        intent: askFor,
        message: note.trim() || undefined,
      });
      glide();
      setUnlocked((prev) => ({ ...prev, [e.id]: data.dealer }));
      setNote('');
    } catch (err) {
      Alert.alert(t('Could not send enquiry'), errorMessage(err));
    } finally {
      setSending(false);
    }
  }, [user, intent, note, t]);

  return (
    <View style={styles.flex}>
      <View style={styles.top}>
        {/* Buy vs hire — the first question a farmer has */}
        <View style={styles.segment}>
          {([['SALE', t('Buy')], ['RENT', t('Hire')]] as const).map(([id, label]) => {
            const on = intent === id;
            return (
              <PressScale
                key={id}
                onPress={() => { glide(); setIntent(id); setOpen(null); }}
                scaleTo={0.97}
                cardStyle={[styles.segItem, on && styles.segItemOn]}
              >
                <Text style={[styles.segText, on && styles.segTextOn]}>{label}</Text>
              </PressScale>
            );
          })}
        </View>

        <View style={styles.searchBar}>
          <IconSearch size={17} stroke={design.ink3} />
          <TextInput
            style={styles.searchInput}
            value={q}
            onChangeText={(v) => { setQ(v); setOpen(null); }}
            placeholder={t('Try "pump", "rotavator", "tractor"…')}
            placeholderTextColor={design.ink3}
            autoCapitalize="none"
            returnKeyType="search"
          />
        </View>

        {categories.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsPad}>
            {[{ id: '', label: t('All'), count: 0 }, ...categories].map((c) => {
              const on = cat === c.id;
              return (
                <PressScale
                  key={c.id || 'all'}
                  onPress={() => { glide(); setCat(on && c.id !== '' ? '' : c.id); setOpen(null); }}
                  scaleTo={0.94}
                  cardStyle={[styles.chip, on && styles.chipOn]}
                >
                  <Text style={[styles.chipText, on && styles.chipTextOn]}>{c.label}</Text>
                </PressScale>
              );
            })}
          </ScrollView>
        )}
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollPad}>
        {failed && <Text style={styles.note}>{t('Could not load equipment — check your connection and try again.')}</Text>}
        {!items && !failed && <Text style={styles.note}>{t('Loading equipment…')}</Text>}
        {items && results.length === 0 && (
          <Text style={styles.note}>
            {intent === 'RENT'
              ? t('No machines on hire match that. Try "Buy", or a different category.')
              : t('Nothing matches that. Try "Hire", or a different category.')}
          </Text>
        )}

        {results.map((e) => {
          const isOpen = open === e.id;
          const dealer = unlocked[e.id];
          const rentable = e.mode === 'RENT' || e.mode === 'BOTH';

          return (
            <View key={e.id} style={[styles.card, isOpen && styles.cardOpen]}>
              <PressScale onPress={() => { glide(); setOpen(isOpen ? null : e.id); setNote(''); }} scaleTo={0.98}>
                <View style={styles.cardRow}>
                  <Text style={styles.cardEmoji}>{CATEGORY_EMOJI[e.category] ?? '🚜'}</Text>
                  <View style={styles.cardMain}>
                    <View style={styles.cardTitleRow}>
                      <Text style={styles.cardName}>{e.title}</Text>
                      {e.condition === 'USED' && <Mono style={styles.usedTag}>USED{e.yearMade ? ` ${e.yearMade}` : ''}</Mono>}
                    </View>
                    <Text style={styles.cardMeta}>
                      {e.dealer.location}, {e.dealer.state}
                      {e.powerHp ? ` · ${e.powerHp} HP` : ''}
                    </Text>
                    <View style={styles.priceRow}>
                      <Text style={styles.price}>{priceLine(e, intent)}</Text>
                      {/* A BOTH listing is worth flagging: the farmer browsing
                          to buy may not realise they could hire it instead. */}
                      {e.mode === 'BOTH' && (
                        <Mono style={styles.altTag}>
                          {intent === 'SALE' ? t('ALSO ON HIRE') : t('ALSO FOR SALE')}
                        </Mono>
                      )}
                    </View>
                  </View>
                </View>

                <View style={styles.badgeRow}>
                  {e.dealer.verified && <Mono style={styles.badge}>✓ {t('VERIFIED DEALER')}</Mono>}
                  {e.dealer.smamEmpanelled && <Mono style={styles.badgeSubsidy}>{t('SMAM SUBSIDY')}</Mono>}
                  <Text style={styles.cardMore}>{isOpen ? t('hide ↑') : t('details ↓')}</Text>
                </View>
              </PressScale>

              {isOpen && (
                <View style={styles.detail}>
                  {e.description ? <Text style={styles.desc}>{e.description}</Text> : null}

                  {e.specs.length > 0 && (
                    <View style={styles.block}>
                      <Mono style={styles.blockLabel}>{t('SPECIFICATIONS')}</Mono>
                      {e.specs.map((s, i) => (
                        <Text key={i} style={styles.specLine}>• {s}</Text>
                      ))}
                    </View>
                  )}

                  {/* Rental terms the farmer needs before calling: the deposit
                      is often the real barrier, not the day rate. */}
                  {rentable && intent === 'RENT' && (
                    <View style={styles.block}>
                      <Mono style={styles.blockLabel}>{t('HIRE TERMS')}</Mono>
                      {e.rentPricePerDay ? <Text style={styles.specLine}>• {money(e.rentPricePerDay, e.currency)} {t('per day')}</Text> : null}
                      {e.rentPricePerHour ? <Text style={styles.specLine}>• {money(e.rentPricePerHour, e.currency)} {t('per hour')}</Text> : null}
                      {e.securityDeposit ? <Text style={styles.specLine}>• {money(e.securityDeposit, e.currency)} {t('refundable deposit')}</Text> : null}
                      <Text style={styles.termsNote}>
                        {t('Availability is confirmed by the dealer — CropBid does not hold bookings.')}
                      </Text>
                    </View>
                  )}

                  <View style={styles.block}>
                    <Mono style={styles.blockLabel}>{t('DEALER')}</Mono>
                    <Text style={styles.dealerName}>{e.dealer.name}</Text>
                    <Text style={styles.specLine}>
                      {e.dealer.location}, {e.dealer.state} · ★ {e.dealer.rating.toFixed(1)}
                    </Text>
                    {e.dealer.smamEmpanelled && (
                      <Text style={styles.subsidyNote}>
                        {t('Empanelled under the SMAM scheme — you may be able to claim 40–50% back on a purchase through this dealer.')}
                      </Text>
                    )}
                  </View>

                  {/* Contact is revealed only after an enquiry — that's the
                      lead capture, and it's what stops the catalogue being
                      scraped for dealer numbers. */}
                  {dealer?.contactPhone ? (
                    <View style={styles.unlocked}>
                      <Mono style={styles.blockLabel}>{t('ENQUIRY SENT')}</Mono>
                      <Text style={styles.unlockedNote}>
                        {t('The dealer has your details and will call back. You can reach them directly too:')}
                      </Text>
                      <PressScale onPress={() => Linking.openURL(`tel:${dealer.contactPhone}`)} cardStyle={styles.callBtn}>
                        <Text style={styles.callBtnText}>{t('Call')} {dealer.contactPhone} →</Text>
                      </PressScale>
                    </View>
                  ) : (
                    <>
                      <TextInput
                        style={styles.noteInput}
                        value={note}
                        onChangeText={setNote}
                        placeholder={
                          intent === 'RENT'
                            ? t('When do you need it, and for how many days? (optional)')
                            : t('Anything you want to ask the dealer? (optional)')
                        }
                        placeholderTextColor={design.ink3}
                        multiline
                      />
                      <PressScale
                        onPress={() => { if (!sending) enquire(e); }}
                        cardStyle={[styles.cta, sending && styles.ctaBusy]}
                      >
                        {sending
                          ? <ActivityIndicator size="small" color="#f4f1ea" />
                          : <Text style={styles.ctaText}>
                              {intent === 'RENT' ? t('Enquire & get dealer number') : t('Get dealer number')}
                            </Text>}
                      </PressScale>
                    </>
                  )}
                </View>
              )}
            </View>
          );
        })}

        {items && results.length > 0 && (
          <Text style={styles.foot}>
            {t('CropBid lists what dealers stock and passes on your enquiry — the sale or hire agreement is directly between you and the dealer. Prices can change; confirm on the call. Never pay in advance to anyone claiming to represent CropBid.')}
          </Text>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: design.bg },

  top: { backgroundColor: design.paper, borderBottomWidth: 1, borderBottomColor: design.line, paddingTop: 10 },

  segment: {
    flexDirection: 'row', gap: 6, marginHorizontal: 16, marginBottom: 10,
    backgroundColor: design.bg, borderWidth: 1, borderColor: design.line,
    borderRadius: 12, padding: 3,
  },
  segItem: { flex: 1, borderRadius: 9, paddingVertical: 8, alignItems: 'center' },
  segItemOn: { backgroundColor: colors.forest },
  segText: { fontFamily: font.sansMed, fontSize: 13, color: design.ink2 },
  segTextOn: { color: '#f4f1ea', fontFamily: font.sansSemi },

  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 16, paddingHorizontal: 12, paddingVertical: 9,
    backgroundColor: design.bg, borderWidth: 1, borderColor: design.line, borderRadius: 12,
  },
  searchInput: { flex: 1, fontFamily: font.sans, fontSize: 14, color: design.ink, padding: 0 },

  chipsPad: { paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
  chip: {
    borderWidth: 1, borderColor: design.line, borderRadius: 999,
    paddingHorizontal: 14, paddingVertical: 7, backgroundColor: design.paper,
  },
  chipOn: { backgroundColor: colors.forest, borderColor: colors.forest },
  chipText: { fontFamily: font.sans, fontSize: 12.5, color: design.ink2 },
  chipTextOn: { color: '#f4f1ea' },

  scrollPad: { paddingTop: 14, paddingBottom: 40 },

  card: {
    marginHorizontal: 16, marginBottom: 10,
    backgroundColor: design.paper, borderWidth: 1, borderColor: design.line, borderRadius: 14,
    padding: 13,
  },
  cardOpen: { borderColor: colors.forest },
  cardRow: { flexDirection: 'row', gap: 11 },
  cardEmoji: { fontSize: 26 },
  cardMain: { flex: 1, minWidth: 0 },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 7, flexWrap: 'wrap' },
  cardName: { fontFamily: font.sansSemi, fontSize: 14.5, color: design.ink, flexShrink: 1 },
  usedTag: { fontSize: 7.5, letterSpacing: 0.6, color: colors.ember },
  cardMeta: { fontFamily: font.sans, fontSize: 11.5, color: design.ink3, marginTop: 2 },

  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 6, flexWrap: 'wrap' },
  price: { fontFamily: font.sansSemi, fontSize: 16, color: colors.forest },
  altTag: { fontSize: 7.5, letterSpacing: 0.6, color: colors.sage },

  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 9, flexWrap: 'wrap' },
  badge: { fontSize: 7.5, letterSpacing: 0.6, color: colors.sage },
  badgeSubsidy: { fontSize: 7.5, letterSpacing: 0.6, color: colors.wheat },
  cardMore: { fontFamily: font.sans, fontSize: 11, color: colors.sage, marginLeft: 'auto' },

  detail: { marginTop: 10, borderTopWidth: 1, borderTopColor: design.line, paddingTop: 10, gap: 8 },
  desc: { fontFamily: font.sans, fontSize: 12.5, lineHeight: 18, color: design.ink2 },
  block: { backgroundColor: design.bg, borderWidth: 1, borderColor: design.line, borderRadius: 10, padding: 11 },
  blockLabel: { fontSize: 8.5, letterSpacing: 0.8, color: design.ink3 },
  specLine: { fontFamily: font.sans, fontSize: 12.5, lineHeight: 18, color: design.ink2, marginTop: 4 },
  termsNote: { fontFamily: font.sans, fontSize: 11, lineHeight: 15, color: design.ink3, marginTop: 7 },
  dealerName: { fontFamily: font.sansSemi, fontSize: 13.5, color: design.ink, marginTop: 5 },
  subsidyNote: { fontFamily: font.sans, fontSize: 11, lineHeight: 15, color: colors.sage, marginTop: 6 },

  noteInput: {
    backgroundColor: design.bg, borderWidth: 1, borderColor: design.line, borderRadius: 10,
    padding: 11, minHeight: 62, textAlignVertical: 'top',
    fontFamily: font.sans, fontSize: 12.5, color: design.ink,
  },
  cta: { backgroundColor: colors.forest, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  ctaBusy: { opacity: 0.7 },
  ctaText: { fontFamily: font.sansSemi, fontSize: 13, color: '#f4f1ea' },

  unlocked: { backgroundColor: design.bg, borderWidth: 1, borderColor: colors.sage, borderRadius: 10, padding: 11, gap: 8 },
  unlockedNote: { fontFamily: font.sans, fontSize: 12, lineHeight: 17, color: design.ink2 },
  callBtn: { backgroundColor: colors.sage, borderRadius: 9, paddingVertical: 11, alignItems: 'center' },
  callBtnText: { fontFamily: font.sansSemi, fontSize: 13, color: '#f4f1ea' },

  note: { fontFamily: font.sans, fontSize: 12.5, color: design.ink3, paddingHorizontal: 16, paddingVertical: 12 },
  foot: {
    fontFamily: font.sans, fontSize: 11, lineHeight: 15, color: design.ink3,
    paddingHorizontal: 16, marginTop: 20,
  },
});
