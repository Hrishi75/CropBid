// =============================================================================
// Rates screen — today's live mandi rates, in full detail
// =============================================================================
// The dedicated mobile page behind the storefront rates rail, the same as the
// web's /rates: every commodity the Government of India's Agmarknet feed
// reported today (about 220; the storefront rail carries 30), grouped, with
// today's modal price, the range most mandis sat in and how local the number
// is. Every crop also carries a vs-usual signal once the server has an earlier
// day of its price to compare with (usualPrices.ts, up to a 30-day average). A search box finds a crop by name, and
// the state chips are the states that actually reported today.
// Tapping a crop opens the market-wise breakdown in a sheet over the screen:
// every reporting mandi with market, district, state, variety and price band.
// Prices are ₹-native.

import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import api from '../api/client';
import { Mono } from '../components/buyerKit';
import { PressScale, Pulse, glide } from '../components/motion';
import { IconClose } from '../components/icons';
import { colors, design, font } from '../theme';
import { money, unitLabel } from '../lib/format';

// --- data shapes (mirror server/src/services/rates.service.ts) ---

type Group =
  | 'vegetables' | 'greens' | 'fruits' | 'cereals' | 'pulses'
  | 'oilseeds' | 'spices' | 'dryfruits' | 'dairy' | 'other';
type Unit = 'KG' | 'QUINTAL' | 'LITRE';

interface LiveRate {
  commodity: string;
  label: string;
  emoji: string;
  unit: Unit;
  group: Group;
  modal: number;
  min: number;
  max: number;
  usual: number | null;      // null until there is an earlier day to compare with
  usualDays: number;
  changePct: number | null;
  mandis: number;
  state: string | null;
  source: 'market' | 'state' | 'national' | 'reference';
}

interface AllRates {
  date: string;
  live: boolean;
  states: string[];
  groups: Array<{ id: Group; title: string }>;
  rates: LiveRate[];
}

interface MarketRow {
  market: string;
  district: string;
  state: string;
  variety: string;
  grade: string;
  date: string;
  modal: number;
  min: number;
  max: number;
}

interface Breakdown { count: number; unit: Unit; records: MarketRow[]; excluded: number; }

// Titles live here rather than coming from the server so they can be
// translated: the English text is the key in hi.json and mr.json. The server
// still decides the order, and a group this map has not heard of falls back
// to the server's own title.
const GROUP_TITLE: Record<Group, string> = {
  vegetables: 'Vegetables',
  greens: 'Leafy greens & herbs',
  fruits: 'Fruits',
  cereals: 'Cereals & millets',
  pulses: 'Pulses',
  oilseeds: 'Oilseeds',
  spices: 'Spices',
  dryfruits: 'Dry fruits & nuts',
  dairy: 'Milk & Dairy',
  other: 'Other farm produce',
};

const SOURCE_LABEL: Record<LiveRate['source'], string> = {
  market: 'MANDI',
  state: 'STATE AVG',
  national: 'INDIA AVG',
  reference: 'REFERENCE',
};

// How many mandi rows to render in an expanded crop before truncating.
const MAX_ROWS = 40;

// --- market-wise breakdown, loaded when a crop is expanded ---

function MarketList({ commodity, state, unit }: { commodity: string; state: string; unit: Unit }) {
  const { t } = useTranslation();
  const [data, setData] = useState<Breakdown | null>(null);
  const [failed, setFailed] = useState(false);
  const [visibleRows, setVisibleRows] = useState(MAX_ROWS);

  // Mounted with a key of crop+state, so a change remounts with fresh state —
  // no synchronous resets needed inside the effect.
  useEffect(() => {
    let on = true;
    const params = new URLSearchParams({ crop: commodity });
    if (state) params.set('state', state);
    api.get(`/rates/markets?${params}`)
      .then(({ data }) => { if (on) { glide(); setData(data); } })
      .catch(() => { if (on) setFailed(true); });
    return () => { on = false; };
  }, [commodity, state]);

  if (failed) return <Text style={styles.note}>{t('Could not load the market breakdown — try again in a moment.')}</Text>;
  if (!data) return <Text style={styles.note}>{t('Loading every reporting mandi…')}</Text>;
  if (data.count === 0) {
    return (
      <Text style={styles.note}>
        {state
          ? t('No mandi reported this crop in {{state}} today — the price above is the reference level.', { state })
          : t('No mandi reported this crop today — the price above is the reference level.')}
      </Text>
    );
  }

  const rows = data.records.slice(0, visibleRows);
  const remainingRows = Math.max(data.count - rows.length, 0);
  return (
    <View style={styles.marketList}>
      <Mono style={styles.marketCount}>
        {t('{{n}} MANDIS REPORTING', { n: data.count })} · ₹/{unitLabel(unit)}
      </Mono>
      {data.excluded > 0 && (
        <Text style={styles.excluded}>
          {t('{{n}} implausible reports left out: a typo or a per-piece price.', { n: data.excluded })}
        </Text>
      )}
      {rows.map((r, i) => (
        <View key={`${r.market}-${r.variety}-${i}`} style={styles.marketRow}>
          <View style={styles.marketLeft}>
            <Text style={styles.marketName} numberOfLines={1}>{r.market}</Text>
            <Text style={styles.marketMeta} numberOfLines={1}>
              {r.district !== '—' ? `${r.district}, ` : ''}{r.state} · {r.variety}
            </Text>
          </View>
          <View style={styles.marketRight}>
            <Text style={styles.marketModal}>{money(r.modal)}</Text>
            <Mono style={styles.marketBand}>{money(r.min)}–{money(r.max)}</Mono>
          </View>
        </View>
      ))}
      {remainingRows > 0 && (
        <PressScale
          onPress={() => { glide(); setVisibleRows((n) => n + MAX_ROWS); }}
          scaleTo={0.96}
          cardStyle={styles.moreRows}
        >
          <Text style={styles.moreRowsText}>
            {t('Show {{n}} more mandis', { n: Math.min(MAX_ROWS, remainingRows) })}
          </Text>
        </PressScale>
      )}
    </View>
  );
}

// --- the price signal under a crop's price (card and sheet alike) ---

function Signal({ r }: { r: LiveRate }) {
  const { t } = useTranslation();
  const hasUsual = r.usual !== null && r.changePct !== null;
  const change = r.changePct ?? 0;
  if (r.source !== 'reference' && hasUsual && Math.abs(change) >= 0.1) {
    return (
      <Mono style={[styles.cardDelta, { color: change >= 0 ? colors.forest : colors.ember2 }]}>
        {change >= 0 ? '▲' : '▼'} {Math.abs(change).toFixed(1)}% {t('vs usual')}
      </Mono>
    );
  }
  return (
    <Mono style={styles.cardSteady}>
      {r.source === 'reference'
        ? t('ref price')
        : hasUsual
          ? t('steady')
          // No earlier day to compare with: say what the number rests on.
          : t(r.mandis === 1 ? '{{n}} mandi' : '{{n}} mandis', { n: r.mandis })}
    </Mono>
  );
}

// --- one crop card (tap to open its mandis) ---

function CropCard({ r, onOpen }: { r: LiveRate; onOpen: () => void }) {
  const { t } = useTranslation();
  return (
    <View style={styles.card}>
      <PressScale onPress={onOpen} scaleTo={0.98}>
        <View style={styles.cardRow}>
          <Text style={styles.cardEmoji}>{r.emoji}</Text>
          <View style={styles.cardMain}>
            <View style={styles.cardTitleRow}>
              <Text style={styles.cardName}>{r.label}</Text>
              <Mono style={styles.cardSource}>{SOURCE_LABEL[r.source]}</Mono>
            </View>
            <Mono style={styles.cardBand}>{money(r.min)}–{money(r.max)} /{unitLabel(r.unit)}</Mono>
          </View>
          <View style={styles.cardPriceCol}>
            <Text style={styles.cardPrice}>
              {money(r.modal)}
              <Text style={styles.cardUnit}>/{unitLabel(r.unit)}</Text>
            </Text>
            <Signal r={r} />
          </View>
        </View>
        <Text style={styles.cardMore}>{t('see every mandi →')}</Text>
      </PressScale>
    </View>
  );
}

// --- the mandi list, in a sheet over the screen ---
// It used to unfold under the card, which on a list of sixty vegetables pushed
// the rest of the screen out of reach. The sheet slides up over the list and
// closes with the ×, a tap on the dimmed screen above it, or Android's back
// button. `r` outlives `visible` so the sheet still has its content while it
// slides away.

function MandiSheet({ r, state, visible, onClose }: {
  r: LiveRate | null; state: string; visible: boolean; onClose: () => void;
}) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.sheetWrap}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel={t('Close')} />
        {r && (
          <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 12) }]}>
            <View style={styles.grabber} />
            <View style={styles.sheetHead}>
              <Text style={styles.sheetEmoji}>{r.emoji}</Text>
              <View style={styles.cardMain}>
                <Mono style={styles.cardSource}>
                  {SOURCE_LABEL[r.source]}{state ? ` · ${state.toUpperCase()}` : ''}
                </Mono>
                <Text style={styles.sheetTitle}>{r.label}</Text>
                <Text style={styles.cardPrice}>
                  {money(r.modal)}
                  <Text style={styles.cardUnit}>/{unitLabel(r.unit)}</Text>
                  <Text style={styles.sheetBand}>   {money(r.min)}–{money(r.max)}</Text>
                </Text>
                <Signal r={r} />
              </View>
              <Pressable
                onPress={onClose}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel={t('Close')}
                style={styles.sheetClose}
              >
                <IconClose size={18} stroke={design.ink2} />
              </Pressable>
            </View>
            <ScrollView style={styles.sheetScroll} showsVerticalScrollIndicator={false}>
              <MarketList key={`${r.commodity}::${state}`} commodity={r.commodity} state={state} unit={r.unit} />
            </ScrollView>
          </View>
        )}
      </View>
    </Modal>
  );
}

// --- screen ---

// Rendered inside MandiScreen (the Mandi section: Live rates ⇄ Forecast) —
// a body, not a standalone route.
export function RatesBody() {
  const { t } = useTranslation();
  const [board, setBoard] = useState<AllRates | null>(null);
  const [failed, setFailed] = useState(false);
  const [state, setState] = useState('');
  const [query, setQuery] = useState('');
  // Which crop the sheet shows, and whether it is up. Kept apart so closing
  // does not blank the sheet before it has slid away.
  const [sheetCrop, setSheetCrop] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const sheetRate = board?.rates.find((r) => r.commodity === sheetCrop) ?? null;

  useEffect(() => {
    let on = true;
    api.get(`/rates/all${state ? `?state=${encodeURIComponent(state)}` : ''}`)
      .then(({ data }) => { if (on) { glide(); setBoard(data); setFailed(false); } })
      .catch(() => { if (on) { setBoard(null); setFailed(true); } });
    return () => { on = false; };
  }, [state]);

  // Search matches the label and the feed's own name, so "karela", "bitter"
  // and "Bitter gourd" all find it.
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!board || !q) return board?.rates ?? [];
    return board.rates.filter((r) => r.label.toLowerCase().includes(q) || r.commodity.toLowerCase().includes(q));
  }, [board, query]);

  // The chips are the states that reported today, plus whichever one is
  // picked, so a choice never vanishes from under the person who made it.
  const states = board ? [...new Set([...board.states, ...(state ? [state] : [])])].sort() : [];
  // With a state picked, board crops it did not report fall back to the
  // national figure; they are shown but not counted as its reports.
  const reported = board?.rates.filter((r) => (state ? r.source === 'state' : r.source !== 'reference')).length ?? 0;

  return (
    <View style={styles.flex}>
      {/* state filter rail */}
      <View style={styles.filterWrap}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterPad}>
          {['', ...states].map((s) => {
            const on = state === s;
            return (
              <PressScale key={s || 'all'} onPress={() => { glide(); setState(s); setSheetOpen(false); }} scaleTo={0.94} cardStyle={[styles.chip, on && styles.chipOn]}>
                <Text style={[styles.chipText, on && styles.chipTextOn]}>{s || t('All India')}</Text>
              </PressScale>
            );
          })}
        </ScrollView>
        <View style={styles.searchWrap}>
          <TextInput
            style={styles.search}
            value={query}
            onChangeText={setQuery}
            placeholder={t('Find a crop: onion, tur, karela…')}
            placeholderTextColor={design.ink3}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            clearButtonMode="while-editing"
          />
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollPad}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        {/* source line */}
        <View style={styles.srcRow}>
          {board?.live ? <Pulse style={styles.liveDot} /> : null}
          <Mono style={styles.srcText}>
            {board
              ? `${board.live ? 'LIVE' : 'REFERENCE'} · GOVT. AGMARKNET · ${board.date}${reported > 0 ? ` · ${reported} ${reported === 1 ? 'CROP' : 'CROPS'}` : ''}`
              : 'GOVT. AGMARKNET'}
          </Mono>
        </View>

        {board && query.trim() !== '' && shown.length === 0 && (
          <Text style={styles.note}>{t('Nothing matches “{{q}}” today.', { q: query.trim() })}</Text>
        )}

        {failed && <Text style={styles.note}>{t('Could not reach the rates service — pull back and try again.')}</Text>}
        {!board && !failed && <Text style={styles.note}>{t("Loading today's rates…")}</Text>}

        {board && board.groups.map((group) => {
          const rates = shown.filter((r) => r.group === group.id);
          if (rates.length === 0) return null;
          return (
            <View key={group.id}>
              <Text style={styles.catTitle}>
                {t(GROUP_TITLE[group.id] ?? group.title)}
                <Text style={styles.catCount}>  {rates.length}</Text>
              </Text>
              {rates.map((r) => (
                <CropCard
                  key={r.commodity}
                  r={r}
                  onOpen={() => { setSheetCrop(r.commodity); setSheetOpen(true); }}
                />
              ))}
            </View>
          );
        })}

        {board && (
          <Text style={styles.foot}>
            {t("Wholesale ₹ as reported by each market committee. The price is the middle of what the mandis reported, and the range is where most of them sat. “vs usual” compares each state's price today with that state's own average over earlier days, up to the last 30, and shows once there is an earlier day to compare with: a signal, not a forecast.")}
          </Text>
        )}
      </ScrollView>

      <MandiSheet
        r={sheetRate}
        state={state}
        visible={sheetOpen && sheetRate !== null}
        onClose={() => setSheetOpen(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: design.bg },

  filterWrap: { borderBottomWidth: 1, borderBottomColor: design.line, backgroundColor: design.paper },
  filterPad: { paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
  chip: {
    borderWidth: 1, borderColor: design.line, borderRadius: 999,
    paddingHorizontal: 14, paddingVertical: 7, backgroundColor: design.paper,
  },
  chipOn: { backgroundColor: colors.forest, borderColor: colors.forest },
  chipText: { fontFamily: font.sans, fontSize: 12.5, color: design.ink2 },
  chipTextOn: { color: '#f4f1ea' },
  searchWrap: { paddingHorizontal: 16, paddingBottom: 10 },
  search: {
    backgroundColor: design.bg, borderWidth: 1, borderColor: design.line, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 9,
    fontFamily: font.sans, fontSize: 14, color: design.ink,
  },

  scrollPad: { paddingBottom: 40 },
  srcRow: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 16, marginTop: 14 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: design.leaf },
  srcText: { fontSize: 9.5, letterSpacing: 0.6, color: design.ink3 },

  catTitle: {
    fontFamily: font.sansSemi, fontSize: 17, letterSpacing: -0.3, color: design.ink,
    paddingHorizontal: 16, marginTop: 22, marginBottom: 8,
  },
  catCount: { fontFamily: font.sans, fontSize: 13, color: design.ink3 },

  card: {
    marginHorizontal: 16, marginBottom: 10,
    backgroundColor: design.paper, borderWidth: 1, borderColor: design.line, borderRadius: 14,
    padding: 13,
  },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  cardEmoji: { fontSize: 24 },
  cardMain: { flex: 1, minWidth: 0 },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  cardName: { fontFamily: font.sansSemi, fontSize: 14.5, color: design.ink },
  cardSource: { fontSize: 8, letterSpacing: 0.6, color: design.ink3 },
  cardBand: { fontSize: 10.5, color: design.ink3, marginTop: 3 },
  cardPriceCol: { alignItems: 'flex-end' },
  cardPrice: { fontFamily: font.sansSemi, fontSize: 16, color: design.ink },
  cardUnit: { fontFamily: font.sans, fontSize: 10, color: design.ink3 },
  cardDelta: { fontSize: 9.5, marginTop: 3 },
  cardSteady: { fontSize: 9.5, marginTop: 3, color: design.ink3 },
  cardMore: { fontFamily: font.sans, fontSize: 11, color: colors.sage, marginTop: 8 },

  sheetWrap: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(20,20,15,0.45)' },
  sheet: {
    maxHeight: '88%',
    backgroundColor: design.bg,
    borderTopLeftRadius: 22, borderTopRightRadius: 22,
    paddingHorizontal: 16, paddingTop: 10,
  },
  grabber: {
    alignSelf: 'center', width: 38, height: 4, borderRadius: 999,
    backgroundColor: design.line, marginBottom: 12,
  },
  sheetHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  sheetEmoji: { fontSize: 30 },
  sheetTitle: { fontFamily: font.sansSemi, fontSize: 20, letterSpacing: -0.4, color: design.ink, marginTop: 2 },
  sheetBand: { fontFamily: font.sans, fontSize: 11, color: design.ink3 },
  sheetClose: {
    width: 32, height: 32, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: design.line, backgroundColor: design.paper,
  },
  sheetScroll: { flexGrow: 0, flexShrink: 1, marginTop: 4 },

  marketList: { marginTop: 10, borderTopWidth: 1, borderTopColor: design.line, paddingTop: 8 },
  marketCount: { fontSize: 9, letterSpacing: 0.6, color: design.ink3, marginBottom: 6 },
  excluded: { fontFamily: font.sans, fontSize: 10.5, color: design.ink3, marginBottom: 6 },
  marketRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    gap: 10, paddingVertical: 7,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: design.line,
  },
  marketLeft: { flex: 1, minWidth: 0 },
  marketName: { fontFamily: font.sansSemi, fontSize: 12.5, color: design.ink },
  marketMeta: { fontFamily: font.sans, fontSize: 10.5, color: design.ink3, marginTop: 1 },
  marketRight: { alignItems: 'flex-end' },
  marketModal: { fontFamily: font.sansSemi, fontSize: 13, color: design.ink },
  marketBand: { fontSize: 9.5, color: design.ink3, marginTop: 1 },
  moreRows: {
    marginTop: 9, alignSelf: 'flex-start',
    borderWidth: 1, borderColor: design.line, borderRadius: 999,
    paddingHorizontal: 12, paddingVertical: 7, backgroundColor: design.paper,
  },
  moreRowsText: { fontFamily: font.sansSemi, fontSize: 11.5, color: colors.sage },

  note: { fontFamily: font.sans, fontSize: 12.5, color: design.ink3, paddingHorizontal: 16, paddingVertical: 12 },
  foot: {
    fontFamily: font.sans, fontSize: 11, lineHeight: 15, color: design.ink3,
    paddingHorizontal: 16, marginTop: 24,
  },
});
