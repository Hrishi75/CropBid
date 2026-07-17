// =============================================================================
// Rates screen — today's live mandi rates, in full detail
// =============================================================================
// The dedicated mobile page behind the storefront rates rail (mirrors the
// web's /rates): every crop on the board grouped by category, with today's
// modal price, min–max band, the vs-usual signal and how local the number is.
// Tapping a crop expands the market-wise breakdown — every reporting mandi
// with market, district, state, variety and price band, straight from the
// Government of India's Agmarknet feed. Prices are ₹-native.

import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import api from '../api/client';
import { Mono } from '../components/buyerKit';
import { PressScale, Pulse, glide } from '../components/motion';
import { colors, design, font } from '../theme';
import { money, unitLabel } from '../lib/format';

// --- data shapes (mirror server/src/services/rates.service.ts) ---

type Cat = 'veg' | 'fruits' | 'grains' | 'spices';
type Unit = 'KG' | 'QUINTAL';

interface LiveRate {
  commodity: string;
  label: string;
  emoji: string;
  unit: Unit;
  cat: Cat;
  modal: number;
  min: number;
  max: number;
  usual: number;
  changePct: number;
  market: string | null;
  state: string | null;
  source: 'market' | 'state' | 'national' | 'reference';
}

interface Board { date: string; live: boolean; rates: LiveRate[]; }

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

interface Breakdown { count: number; unit: Unit; records: MarketRow[]; }

const CATS: Array<{ id: Cat; title: string }> = [
  { id: 'veg',    title: 'Fresh Vegetables' },
  { id: 'fruits', title: 'Seasonal Fruits' },
  { id: 'grains', title: 'Grains & Pulses' },
  { id: 'spices', title: 'Spices & Oilseeds' },
];

const SOURCE_LABEL: Record<LiveRate['source'], string> = {
  market: 'MANDI',
  state: 'STATE AVG',
  national: 'INDIA AVG',
  reference: 'REFERENCE',
};

// Complete state set accepted by the rates endpoint, ordered for a compact rail.
const STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh',
  'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka',
  'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram',
  'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu',
  'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal', 'Delhi',
];

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

// --- one crop card (tap to expand the mandi list) ---

function CropCard({ r, open, onToggle, state }: { r: LiveRate; open: boolean; onToggle: () => void; state: string }) {
  const { t } = useTranslation();
  const showSignal = r.source !== 'reference' && Math.abs(r.changePct) >= 0.1;
  return (
    <View style={[styles.card, open && styles.cardOpen]}>
      <PressScale onPress={() => { glide(); onToggle(); }} scaleTo={0.98}>
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
            {showSignal ? (
              <Mono style={[styles.cardDelta, { color: r.changePct >= 0 ? colors.forest : colors.ember2 }]}>
                {r.changePct >= 0 ? '▲' : '▼'} {Math.abs(r.changePct).toFixed(1)}% {t('vs usual')}
              </Mono>
            ) : (
              <Mono style={styles.cardSteady}>{r.source === 'reference' ? t('ref price') : t('steady')}</Mono>
            )}
          </View>
        </View>
        <Text style={styles.cardMore}>{open ? t('hide mandis ↑') : t('see every mandi ↓')}</Text>
      </PressScale>
      {open && <MarketList key={`${r.commodity}::${state}`} commodity={r.commodity} state={state} unit={r.unit} />}
    </View>
  );
}

// --- screen ---

// Rendered inside MandiScreen (the Mandi section: Live rates ⇄ Forecast) —
// a body, not a standalone route.
export function RatesBody() {
  const { t } = useTranslation();
  const [board, setBoard] = useState<Board | null>(null);
  const [failed, setFailed] = useState(false);
  const [state, setState] = useState('');
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    let on = true;
    api.get(`/rates/board${state ? `?state=${encodeURIComponent(state)}` : ''}`)
      .then(({ data }) => { if (on) { glide(); setBoard(data); setFailed(false); } })
      .catch(() => { if (on) { setBoard(null); setFailed(true); } });
    return () => { on = false; };
  }, [state]);

  return (
    <View style={styles.flex}>
      {/* state filter rail */}
      <View style={styles.filterWrap}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterPad}>
          {['', ...STATES].map((s) => {
            const on = state === s;
            return (
              <PressScale key={s || 'all'} onPress={() => { glide(); setState(s); setOpen(null); }} scaleTo={0.94} cardStyle={[styles.chip, on && styles.chipOn]}>
                <Text style={[styles.chipText, on && styles.chipTextOn]}>{s || t('All India')}</Text>
              </PressScale>
            );
          })}
        </ScrollView>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollPad}>
        {/* source line */}
        <View style={styles.srcRow}>
          {board?.live ? <Pulse style={styles.liveDot} /> : null}
          <Mono style={styles.srcText}>
            {board ? `${board.live ? 'LIVE' : 'REFERENCE'} · GOVT. AGMARKNET · ${board.date}` : 'GOVT. AGMARKNET'}
          </Mono>
        </View>

        {failed && <Text style={styles.note}>{t('Could not reach the rates service — pull back and try again.')}</Text>}
        {!board && !failed && <Text style={styles.note}>{t("Loading today's rates…")}</Text>}

        {board && CATS.map((cat) => {
          const rates = board.rates.filter((r) => r.cat === cat.id);
          if (rates.length === 0) return null;
          return (
            <View key={cat.id}>
              <Text style={styles.catTitle}>{t(cat.title)}</Text>
              {rates.map((r) => (
                <CropCard
                  key={r.commodity}
                  r={r}
                  state={state}
                  open={open === r.commodity}
                  onToggle={() => setOpen(open === r.commodity ? null : r.commodity)}
                />
              ))}
            </View>
          );
        })}

        {board && (
          <Text style={styles.foot}>
            {t("Wholesale ₹ as reported by each market committee. “vs usual” compares today's modal price with the crop's typical level — a signal, not a forecast.")}
          </Text>
        )}
      </ScrollView>
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

  scrollPad: { paddingBottom: 40 },
  srcRow: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 16, marginTop: 14 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: design.leaf },
  srcText: { fontSize: 9.5, letterSpacing: 0.6, color: design.ink3 },

  catTitle: {
    fontFamily: font.sansSemi, fontSize: 17, letterSpacing: -0.3, color: design.ink,
    paddingHorizontal: 16, marginTop: 22, marginBottom: 8,
  },

  card: {
    marginHorizontal: 16, marginBottom: 10,
    backgroundColor: design.paper, borderWidth: 1, borderColor: design.line, borderRadius: 14,
    padding: 13,
  },
  cardOpen: { borderColor: colors.forest },
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

  marketList: { marginTop: 10, borderTopWidth: 1, borderTopColor: design.line, paddingTop: 8 },
  marketCount: { fontSize: 9, letterSpacing: 0.6, color: design.ink3, marginBottom: 6 },
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
