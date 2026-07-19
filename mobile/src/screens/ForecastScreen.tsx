// =============================================================================
// Forecast screen — demand & supply predictions, next 7 days
// =============================================================================
// The prediction page of the Mandi section (mirrors the web's /forecast).
// For every crop on the rates board: a 7-day price outlook with a forecast
// band, a supply index and a demand index — and, on tap, the exact drivers
// that produced the numbers plus what the forecast means for a farmer and for
// a buyer. The model is deterministic and explainable; this screen's job is
// to show its work, never to oversell it. Prices are ₹-native (India feed).

import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import api from '../api/client';
import { Mono } from '../components/buyerKit';
import { PressScale, Pulse, glide } from '../components/motion';
import { colors, design, font } from '../theme';
import { money, unitLabel } from '../lib/format';

// --- data shapes (mirror server/src/services/prediction.service.ts) ---

type Direction = 'rise' | 'hold' | 'ease';

interface Prediction {
  commodity: string;
  label: string;
  emoji: string;
  unit: 'KG' | 'QUINTAL' | 'LITRE';
  cat: 'veg' | 'dairy' | 'fruits' | 'grains' | 'spices';
  modal: number;
  usual: number;
  changePct: number;
  source: 'market' | 'state' | 'national' | 'reference';
  mandisReporting: number;
  supply: { score: number; level: 'tight' | 'balanced' | 'ample'; drivers: string[] };
  demand: { score: number; level: 'soft' | 'steady' | 'strong'; drivers: string[] };
  outlook: { direction: Direction; pct7d: number; low: number; high: number; confidence: 'high' | 'medium' | 'low' };
  advice: { farmer: string; buyer: string };
  platform: { activeListings: number; listedQty: number; bids14d: number };
}

interface ForecastBoard {
  date: string;
  generatedAt: string;
  horizonDays: number;
  live: boolean;
  predictions: Prediction[];
}

const DIRECTION_META: Record<Direction, { arrow: string; color: string }> = {
  rise: { arrow: '▲', color: colors.forest },
  hold: { arrow: '▬', color: design.ink3 },
  ease: { arrow: '▼', color: colors.ember2 },
};

const GROUPS: Array<{ dir: Direction; title: string; eyebrow: string }> = [
  { dir: 'rise', title: 'Set to rise', eyebrow: "Hold if you can — sellers' week" },
  { dir: 'ease', title: 'Set to ease', eyebrow: "Sell sooner — buyers' week ahead" },
  { dir: 'hold', title: 'Holding steady', eyebrow: 'Negotiate around the modal' },
];

// --- pieces ---

// Single-value index meter, 0–100. The level word carries the meaning; the
// bar only shows magnitude — never color-alone.
function IndexMeter({ name, score, level }: { name: string; score: number; level: string }) {
  return (
    <View style={styles.meter}>
      <Mono style={styles.meterName}>{name}</Mono>
      <View style={styles.meterTrack}>
        <View style={[styles.meterFill, { width: `${Math.min(Math.max(score, 0), 100)}%` }]} />
      </View>
      <Text style={styles.meterLevel}>{level}</Text>
    </View>
  );
}

function PredictionCard({ p, open, onToggle }: { p: Prediction; open: boolean; onToggle: () => void }) {
  const { t } = useTranslation();
  const d = DIRECTION_META[p.outlook.direction];
  const move = p.outlook.direction === 'hold'
    ? `±1% ${t('next 7 days')}`
    : `${p.outlook.pct7d > 0 ? '+' : ''}${p.outlook.pct7d.toFixed(1)}% ${t('next 7 days')}`;

  return (
    <View style={[styles.card, open && styles.cardOpen]}>
      <PressScale onPress={() => { glide(); onToggle(); }} scaleTo={0.98}>
        <View style={styles.cardTop}>
          <Text style={styles.cardEmoji}>{p.emoji}</Text>
          <Text style={styles.cardName} numberOfLines={1}>{p.label}</Text>
          <Mono style={styles.cardConf}>{t(`${p.outlook.confidence} confidence`)}</Mono>
        </View>

        <Text style={[styles.cardDir, { color: d.color }]}>{d.arrow} {move}</Text>

        <View style={styles.cardPriceRow}>
          <Text style={styles.cardPriceNow}>
            {money(p.modal)}
            <Text style={styles.cardUnit}>/{unitLabel(p.unit)}</Text> {t('today')}
          </Text>
          <Text style={styles.cardPriceArrow}>→</Text>
          <Mono style={styles.cardBand}>{money(p.outlook.low)}–{money(p.outlook.high)} {t('in 7d')}</Mono>
        </View>

        <View style={styles.meters}>
          <IndexMeter name={t('SUPPLY')} score={p.supply.score} level={t(p.supply.level)} />
          <IndexMeter name={t('DEMAND')} score={p.demand.score} level={t(p.demand.level)} />
        </View>

        <Text style={styles.cardMore}>{open ? t('hide the why ↑') : t('why? see the drivers ↓')}</Text>
      </PressScale>

      {open && (
        <View style={styles.detail}>
          <Mono style={styles.detailHead}>{t('What the model saw').toUpperCase()}</Mono>
          {[...p.supply.drivers, ...p.demand.drivers].map((line) => (
            <Text key={line} style={styles.driver}>· {line}</Text>
          ))}
          <View style={styles.advice}>
            <Mono style={styles.adviceWho}>{t("IF YOU'RE SELLING")}</Mono>
            <Text style={styles.adviceText}>{p.advice.farmer}</Text>
            <Mono style={[styles.adviceWho, { marginTop: 10 }]}>{t("IF YOU'RE BUYING")}</Mono>
            <Text style={styles.adviceText}>{p.advice.buyer}</Text>
          </View>
        </View>
      )}
    </View>
  );
}

// --- body ---

// Rendered inside MandiScreen (the Mandi section: Live rates ⇄ Forecast) —
// a body, not a standalone route.
export function ForecastBody() {
  const { t } = useTranslation();
  const [board, setBoard] = useState<ForecastBoard | null>(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    let on = true;
    api.get('/rates/predictions')
      .then(({ data }) => { if (on) { glide(); setBoard(data); setFailed(false); } })
      .catch(() => { if (on) { setBoard(null); setFailed(true); } });
    return () => { on = false; };
  }, []);

  const counts = board
    ? {
        rise: board.predictions.filter((p) => p.outlook.direction === 'rise').length,
        ease: board.predictions.filter((p) => p.outlook.direction === 'ease').length,
        hold: board.predictions.filter((p) => p.outlook.direction === 'hold').length,
      }
    : null;

  return (
    <View style={styles.flex}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollPad}>
        {/* source line */}
        <View style={styles.srcRow}>
          {board?.live ? <Pulse style={styles.liveDot} /> : null}
          <Mono style={styles.srcText}>
            {board
              ? `${board.live ? 'LIVE' : 'REFERENCE'} · ${t('next 7 days').toUpperCase()} · ${board.date}`
              : 'PREDICTION ENGINE'}
          </Mono>
        </View>

        {/* tally — how many crops point which way */}
        {counts && (
          <View style={styles.tally}>
            <TallyItem n={counts.rise} color={colors.forest} label={t('set to rise')} />
            <TallyItem n={counts.hold} color={design.ink3} label={t('steady')} />
            <TallyItem n={counts.ease} color={colors.ember2} label={t('set to ease')} />
          </View>
        )}

        {failed && <Text style={styles.note}>{t('Could not reach the prediction engine — pull back and try again.')}</Text>}
        {!board && !failed && <Text style={styles.note}>{t("Running the model on today's mandi data…")}</Text>}

        {board && GROUPS.map(({ dir, title, eyebrow }) => {
          const rows = board.predictions.filter((p) => p.outlook.direction === dir);
          if (rows.length === 0) return null;
          return (
            <View key={dir}>
              <View style={styles.groupHead}>
                <Mono style={styles.groupEyebrow}>{t(eyebrow).toUpperCase()}</Mono>
                <Text style={styles.groupTitle}>
                  <Text style={{ color: DIRECTION_META[dir].color }}>{DIRECTION_META[dir].arrow}</Text> {t(title)}
                </Text>
              </View>
              {rows.map((p) => (
                <PredictionCard
                  key={p.commodity}
                  p={p}
                  open={open === p.commodity}
                  onToggle={() => setOpen(open === p.commodity ? null : p.commodity)}
                />
              ))}
            </View>
          );
        })}

        {board && (
          <Text style={styles.foot}>
            {t("The forecast is a deterministic model over the Government of India's Agmarknet feed, the Indian harvest calendar, and live CropBid activity. An explainable estimate to negotiate around — not a guarantee.")}
          </Text>
        )}
      </ScrollView>
    </View>
  );
}

function TallyItem({ n, color, label }: { n: number; color: string; label: string }) {
  return (
    <View style={styles.tallyItem}>
      <Text style={[styles.tallyN, { color }]}>{n}</Text>
      <Text style={styles.tallyLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: design.bg },

  scrollPad: { paddingBottom: 40 },
  srcRow: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 16, marginTop: 14 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: design.leaf },
  srcText: { fontSize: 9.5, letterSpacing: 0.6, color: design.ink3 },

  tally: {
    flexDirection: 'row', gap: 10,
    marginHorizontal: 16, marginTop: 12,
    backgroundColor: design.paper, borderWidth: 1, borderColor: design.line, borderRadius: 14,
    paddingVertical: 12, paddingHorizontal: 8,
  },
  tallyItem: { flex: 1, alignItems: 'center', gap: 2 },
  tallyN: { fontFamily: font.sansSemi, fontSize: 20, letterSpacing: -0.4 },
  tallyLabel: { fontFamily: font.sans, fontSize: 10.5, color: design.ink3, textAlign: 'center' },

  groupHead: { paddingHorizontal: 16, marginTop: 22, marginBottom: 8 },
  groupEyebrow: { fontSize: 9, letterSpacing: 0.6, color: design.ink3 },
  groupTitle: { fontFamily: font.sansSemi, fontSize: 17, letterSpacing: -0.3, color: design.ink, marginTop: 3 },

  card: {
    marginHorizontal: 16, marginBottom: 10,
    backgroundColor: design.paper, borderWidth: 1, borderColor: design.line, borderRadius: 14,
    padding: 13,
  },
  cardOpen: { borderColor: colors.forest },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  cardEmoji: { fontSize: 22 },
  cardName: { flex: 1, minWidth: 0, fontFamily: font.sansSemi, fontSize: 14.5, color: design.ink },
  cardConf: { fontSize: 8, letterSpacing: 0.6, color: design.ink3 },
  cardDir: { fontFamily: font.sansSemi, fontSize: 13, marginTop: 8 },
  cardPriceRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 6, flexWrap: 'wrap' },
  cardPriceNow: { fontFamily: font.sansSemi, fontSize: 15, color: design.ink },
  cardUnit: { fontFamily: font.sans, fontSize: 10, color: design.ink3 },
  cardPriceArrow: { fontFamily: font.sans, fontSize: 13, color: design.ink3 },
  cardBand: { fontSize: 11, color: design.ink2 },

  meters: { marginTop: 10, gap: 6 },
  meter: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  meterName: { width: 62, fontSize: 8.5, letterSpacing: 0.6, color: design.ink3 },
  meterTrack: { flex: 1, height: 5, backgroundColor: design.paper2, borderRadius: 3, overflow: 'hidden' },
  meterFill: { height: '100%', borderRadius: 3, backgroundColor: colors.forest },
  meterLevel: { width: 64, fontFamily: font.sans, fontSize: 11, color: design.ink2, textAlign: 'right' },

  cardMore: { fontFamily: font.sans, fontSize: 11, color: colors.sage, marginTop: 9 },

  detail: { marginTop: 10, borderTopWidth: 1, borderTopColor: design.line, paddingTop: 10 },
  detailHead: { fontSize: 9, letterSpacing: 0.6, color: design.ink3, marginBottom: 5 },
  driver: { fontFamily: font.sans, fontSize: 12, lineHeight: 17, color: design.ink2 },
  advice: { marginTop: 10, backgroundColor: design.paper2, borderRadius: 10, padding: 11 },
  adviceWho: { fontSize: 9, letterSpacing: 0.6, color: design.ink3 },
  adviceText: { fontFamily: font.sans, fontSize: 12.5, lineHeight: 18, color: design.ink, marginTop: 3 },

  note: { fontFamily: font.sans, fontSize: 12.5, color: design.ink3, paddingHorizontal: 16, paddingVertical: 12 },
  foot: {
    fontFamily: font.sans, fontSize: 11, lineHeight: 15, color: design.ink3,
    paddingHorizontal: 16, marginTop: 24,
  },
});
