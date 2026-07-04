// Agent brief — wired to /agent/config. Shows the user's real guardrails
// (price cap, auto-accept, distance), preferred crops, and a live deploy/pause
// toggle hitting POST /agent/toggle.
//
// The config is re-fetched every time the tab gains focus (not just on mount),
// so edits made on the web dashboard or in a previous session never show stale.
// "Calibrate" flips the screen into an edit mode where every guardrail — style,
// price guard, auto-accept, distance, auto-negotiate, preferred crops — can be
// changed in-app and saved via PUT /agent/config.
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IconBolt, IconCheck } from '../../components/icons';
import { Eyebrow, Mono, StatusPill } from '../../components/buyerKit';
import { colors, design, font } from '../../theme';
import { useAuth } from '../../context/AuthContext';
import { getAgentConfig, toggleAgent, updateAgentConfig } from '../../api/endpoints';
import { errorMessage } from '../../api/client';
import type { AgentConfig, NegotiationStyle } from '../../api/types';
import { money } from '../../lib/format';

// Compact crop set for the picker (server accepts any string[]). Crops already
// selected but missing from this list are merged in so they stay toggleable.
const CROPS = [
  'Rice', 'Wheat', 'Onion', 'Tomato', 'Potato', 'Grape', 'Sugarcane', 'Cotton',
  'Soybean', 'Maize', 'Chili', 'Turmeric', 'Banana', 'Mango', 'Groundnut', 'Coffee',
];

const STYLES: { value: NegotiationStyle; label: string; desc: string }[] = [
  { value: 'AGGRESSIVE', label: 'Aggressive', desc: 'push hard' },
  { value: 'BALANCED', label: 'Balanced', desc: 'meet fair' },
  { value: 'CONSERVATIVE', label: 'Cautious', desc: 'close fast' },
];

function GuardRow({ label, val, bar, hot }: { label: string; val: string; bar: number; hot?: boolean }) {
  const accent = hot ? colors.ember : colors.forest;
  const clamped = Math.min(Math.max(bar, 0.02), 0.98);
  return (
    <View style={{ paddingVertical: 13 }}>
      <View style={styles.guardHead}>
        <Mono style={styles.guardLabel}>{label}</Mono>
        <Mono style={[styles.guardVal, { color: hot ? colors.ember : design.ink }]}>{val}</Mono>
      </View>
      <View style={styles.track}>
        <View style={[styles.trackFill, { width: `${clamped * 100}%`, backgroundColor: accent }]} />
        <View style={[styles.knob, { left: `${clamped * 100}%`, borderColor: accent }]} />
      </View>
    </View>
  );
}

export default function BriefScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [config, setConfig] = useState<AgentConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Edit ("calibrate") mode
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editStyle, setEditStyle] = useState<NegotiationStyle>('BALANCED');
  const [editPrice, setEditPrice] = useState('');
  const [editAccept, setEditAccept] = useState('');
  const [editDistance, setEditDistance] = useState('');
  const [editAutoNeg, setEditAutoNeg] = useState(true);
  const [editCrops, setEditCrops] = useState<string[]>([]);

  const currency = user?.currency || 'INR';

  const load = useCallback(async () => {
    try {
      setConfig(await getAgentConfig());
      setError(null);
    } catch (e) {
      setError(errorMessage(e, 'Could not load your agent'));
    }
  }, []);

  // Refetch whenever the tab regains focus — tab screens stay mounted, so a
  // mount-only fetch would show yesterday's guardrails after a web-side edit.
  // Paused while calibrating: a background refetch would wipe a validation
  // error and desync the form fields from the refreshed config.
  useFocusEffect(
    useCallback(() => {
      if (!editing) load();
    }, [load, editing]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  async function onToggle() {
    if (busy) return;
    setBusy(true);
    try {
      setConfig(await toggleAgent());
    } catch (e) {
      setError(errorMessage(e, 'Could not update your agent'));
    } finally {
      setBusy(false);
    }
  }

  const isFarmer =
    (config?.agentType ?? (user?.role === 'FARMER' ? 'FARMER_AGENT' : 'BUYER_AGENT')) ===
    'FARMER_AGENT';
  // Farmers guard a floor (minPrice); buyers guard a ceiling (maxPrice).
  const priceGuard = (isFarmer ? config?.minPrice : config?.maxPrice) ?? null;
  const autoAccept = config?.autoAcceptThreshold ?? null;
  const distance = config?.maxDistanceKm ?? null;
  const crops = config?.preferredCrops ?? [];

  function enterEdit() {
    if (!config) return;
    setEditStyle(config.negotiationStyle);
    setEditPrice(priceGuard != null ? String(priceGuard) : '');
    setEditAccept(autoAccept != null ? String(autoAccept) : '');
    setEditDistance(distance != null ? String(distance) : '');
    setEditAutoNeg(config.autoNegotiate);
    setEditCrops(config.preferredCrops ?? []);
    setError(null);
    setEditing(true);
  }

  function toggleEditCrop(crop: string) {
    setEditCrops((prev) => (prev.includes(crop) ? prev.filter((c) => c !== crop) : [...prev, crop]));
  }

  // Strict decimal check — Number() alone would accept "1e3" / "0x10".
  function parseAmount(raw: string, label: string): { value: number | null; error?: string } {
    const t = raw.trim();
    if (!t) return { value: null };
    if (!/^\d+(?:\.\d+)?$/.test(t)) return { value: null, error: `Enter a valid ${label}` };
    const n = Number(t);
    if (n <= 0) return { value: null, error: `${label[0].toUpperCase()}${label.slice(1)} must be greater than zero` };
    return { value: n };
  }

  async function onSave() {
    if (saving || !config) return;

    const price = parseAmount(editPrice, isFarmer ? 'floor price' : 'price ceiling');
    if (price.error) return setError(price.error);
    const accept = parseAmount(editAccept, 'auto-accept price');
    if (accept.error) return setError(accept.error);
    // Auto-accept must sit on the safe side of the price guard, or the agent
    // would auto-accept deals the guard exists to block.
    if (price.value != null && accept.value != null && (isFarmer ? accept.value < price.value : accept.value > price.value)) {
      return setError(
        isFarmer
          ? 'Auto-accept price must be at or above your floor price'
          : 'Auto-accept price must be at or below your price ceiling',
      );
    }
    const dist = editDistance.trim();
    if (dist && !/^\d+$/.test(dist)) return setError('Enter a valid distance in km');

    setError(null);
    setSaving(true);
    try {
      const updated = await updateAgentConfig({
        negotiationStyle: editStyle,
        ...(isFarmer ? { minPrice: price.value } : { maxPrice: price.value }),
        autoAcceptThreshold: accept.value,
        maxDistanceKm: dist ? parseInt(dist, 10) : null,
        autoNegotiate: editAutoNeg,
        preferredCrops: editCrops,
      });
      setConfig(updated);
      setEditing(false);
    } catch (e) {
      setError(errorMessage(e, 'Could not save your agent brief'));
    } finally {
      setSaving(false);
    }
  }

  if (!config && !error) {
    return (
      <View style={[styles.flex, { justifyContent: 'center' }]}>
        <ActivityIndicator color={colors.forest} />
      </View>
    );
  }

  const briefText = priceGuard != null
    ? isFarmer
      ? (
        <>
          Sell{' '}
          <Text style={styles.b}>{crops.length > 0 ? crops.join(', ') : 'my crops'}</Text>
          {' '}from my farm. Never accept below <Text style={styles.b}>{money(priceGuard, currency)}</Text> per unit.
          {autoAccept != null ? <> Say yes at once at or above <Text style={styles.b}>{money(autoAccept, currency)}</Text>.</> : null}
        </>
      )
      : (
        <>
          Buy{' '}
          <Text style={styles.b}>{crops.length > 0 ? crops.join(', ') : 'any matching crop'}</Text>
          {' '}within my quality requirements. Don't pay over <Text style={styles.b}>{money(priceGuard, currency)}</Text> per unit.
          {autoAccept != null ? <> Auto-accept anything at or below <Text style={styles.b}>{money(autoAccept, currency)}</Text>.</> : null}
        </>
      )
    : isFarmer
      ? <>No lowest price set yet. Tap <Text style={styles.b}>change</Text> and set the lowest price you'll accept — your helper will never go below it.</>
      : <>No price ceiling set yet. Tap <Text style={styles.b}>Calibrate</Text> to set the walk-away point your agent will defend.</>;

  const cropOptions = [...CROPS, ...editCrops.filter((c) => !CROPS.includes(c))];

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 2, paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          editing ? undefined : <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.forest} />
        }
      >
        <View style={styles.titlePad}>
          <View style={styles.titleRow}>
            <Eyebrow>{isFarmer ? 'Your AI helper' : 'Your buyer agent'}</Eyebrow>
            {config ? (
              <StatusPill tone={config.active ? 'sage' : 'paper'} dot={config.active}>
                {config.active ? (isFarmer ? 'working' : 'deployed') : 'paused'}
              </StatusPill>
            ) : null}
          </View>
          <Text style={styles.h1}>
            {editing
              ? isFarmer
                ? <>Set your helper's <Text style={styles.h1Serif}>rules.</Text></>
                : <>Calibrate your <Text style={styles.h1Serif}>agent.</Text></>
              : isFarmer
                ? <>Sells for you, <Text style={styles.h1Serif}>day and night.</Text></>
                : <>Briefed in <Text style={styles.h1Serif}>plain English.</Text></>}
          </Text>
        </View>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        {!editing ? (
          <>
            {/* brief card */}
            <View style={{ paddingHorizontal: 16, paddingTop: 14 }}>
              <View style={styles.card}>
                <Mono style={styles.briefTag}>● BRIEF · {config?.negotiationStyle ?? 'BALANCED'}</Mono>
                <Text style={styles.briefBody}>{briefText}</Text>
              </View>
            </View>

            {/* guardrails */}
            <View style={[styles.sectionHead, { paddingTop: 20 }]}>
              <Eyebrow>{isFarmer ? 'Your rules · never broken' : 'Guardrails · hard stop'}</Eyebrow>
              <Pressable onPress={enterEdit} disabled={!config} hitSlop={8}>
                <Mono style={styles.calibrateLink}>{isFarmer ? 'change →' : 'calibrate →'}</Mono>
              </Pressable>
            </View>
            <View style={{ paddingHorizontal: 16 }}>
              <View style={styles.guardCard}>
                <GuardRow
                  label={isFarmer ? 'LOWEST PRICE' : 'PRICE CEILING'}
                  val={priceGuard != null ? `${money(priceGuard, currency)} /unit` : 'not set'}
                  bar={priceGuard != null ? 0.9 : 0}
                  hot
                />
                <View style={styles.divider} />
                <GuardRow
                  label={isFarmer ? 'SAYS YES ABOVE' : 'AUTO-ACCEPT AT'}
                  val={autoAccept != null ? `${money(autoAccept, currency)} /unit` : 'not set'}
                  bar={autoAccept != null && priceGuard ? autoAccept / priceGuard : 0}
                />
                <View style={styles.divider} />
                <GuardRow
                  label="MAX DISTANCE"
                  val={distance != null ? `${distance} km` : 'anywhere'}
                  bar={distance != null ? Math.min(distance / 1000, 1) : 0.98}
                />
                <View style={styles.divider} />
                <GuardRow
                  label={isFarmer ? 'BARGAINS FOR YOU' : 'AUTO-NEGOTIATE'}
                  val={config?.autoNegotiate ? 'on' : 'off'}
                  bar={config?.autoNegotiate ? 0.98 : 0.02}
                  hot={!config?.autoNegotiate}
                />
              </View>
            </View>

            {/* preferred crops */}
            <View style={[styles.sectionHead, { paddingTop: 20 }]}>
              <Eyebrow>Preferred crops</Eyebrow>
            </View>
            <View style={styles.chipWrap}>
              {crops.length > 0 ? (
                crops.map((t) => (
                  <View key={t} style={[styles.cpChip, styles.cpChipIdle]}>
                    <IconCheck size={13} sw={2.4} stroke={colors.sage} />
                    <Text style={[styles.cpText, { color: design.ink2 }]}>{t}</Text>
                  </View>
                ))
              ) : (
                <View style={[styles.cpChip, styles.cpChipIdle]}>
                  <Text style={[styles.cpText, { color: design.ink3 }]}>
                    {isFarmer ? 'All your crops · tap change to pick some' : 'Any crop · tap calibrate to set preferences'}
                  </Text>
                </View>
              )}
            </View>
          </>
        ) : (
          <>
            {/* style picker */}
            <View style={[styles.sectionHead, { paddingTop: 14 }]}>
              <Eyebrow>{isFarmer ? 'How should it bargain?' : 'Style · negotiation cadence'}</Eyebrow>
            </View>
            <View style={styles.styleRow}>
              {STYLES.map((s) => {
                const sel = editStyle === s.value;
                return (
                  <Pressable
                    key={s.value}
                    onPress={() => setEditStyle(s.value)}
                    style={[styles.styleCell, sel && styles.styleCellActive]}
                  >
                    <Text style={[styles.styleLabel, sel && { color: colors.forest }]}>{s.label}</Text>
                    <Mono style={styles.styleDesc}>{s.desc}</Mono>
                  </Pressable>
                );
              })}
            </View>

            {/* guardrail inputs */}
            <View style={[styles.sectionHead, { paddingTop: 20 }]}>
              <Eyebrow>{isFarmer ? 'Your rules · never broken' : 'Guardrails · hard stop'}</Eyebrow>
              <Mono style={styles.noOverride}>{isFarmer ? 'always followed' : 'no override'}</Mono>
            </View>
            <View style={{ paddingHorizontal: 16 }}>
              <View style={[styles.guardCard, { paddingVertical: 16 }]}>
                <Text style={styles.inputLabel}>
                  {isFarmer ? `Lowest price you'll accept (${currency} per unit)` : `Max buy price (${currency} per unit)`}
                </Text>
                <TextInput
                  style={styles.input}
                  value={editPrice}
                  onChangeText={setEditPrice}
                  keyboardType="numeric"
                  placeholder="e.g., 2000"
                  placeholderTextColor={design.ink3}
                />

                <Text style={styles.inputLabel}>
                  {isFarmer ? 'Say yes at once if the offer is above (optional)' : 'Auto-accept at or below (optional)'}
                </Text>
                <TextInput
                  style={styles.input}
                  value={editAccept}
                  onChangeText={setEditAccept}
                  keyboardType="numeric"
                  placeholder="e.g., 3000"
                  placeholderTextColor={design.ink3}
                />

                <Text style={styles.inputLabel}>Max distance in km (blank = anywhere)</Text>
                <TextInput
                  style={styles.input}
                  value={editDistance}
                  onChangeText={setEditDistance}
                  keyboardType="number-pad"
                  placeholder="e.g., 500"
                  placeholderTextColor={design.ink3}
                />

                <View style={styles.switchRow}>
                  <View style={{ flex: 1, paddingRight: 12 }}>
                    <Text style={styles.inputLabel}>{isFarmer ? 'Bargain for me' : 'Auto-negotiate'}</Text>
                    <Text style={styles.switchHint}>
                      {isFarmer ? 'It talks to buyers and pushes for a better price' : 'Let the agent counter offers round by round'}
                    </Text>
                  </View>
                  <Switch
                    value={editAutoNeg}
                    onValueChange={setEditAutoNeg}
                    trackColor={{ false: design.line, true: colors.forest }}
                    thumbColor="#fff"
                  />
                </View>
              </View>
            </View>

            {/* crop picker */}
            <View style={[styles.sectionHead, { paddingTop: 20 }]}>
              <Eyebrow>Preferred crops · {editCrops.length} selected</Eyebrow>
            </View>
            <View style={styles.chipWrap}>
              {cropOptions.map((crop) => {
                const sel = editCrops.includes(crop);
                return (
                  <Pressable
                    key={crop}
                    onPress={() => toggleEditCrop(crop)}
                    style={[styles.cpChip, sel ? styles.cpChipActive : styles.cpChipIdle]}
                  >
                    {sel ? <IconCheck size={13} sw={2.4} stroke="#f4f1ea" /> : null}
                    <Text style={[styles.cpText, { color: sel ? '#f4f1ea' : design.ink2 }]}>{crop}</Text>
                  </Pressable>
                );
              })}
            </View>
          </>
        )}
      </ScrollView>

      {/* bottom bar — deploy/pause in read mode, cancel/save in edit mode */}
      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 14 }]}>
        <View style={{ paddingHorizontal: 16, flexDirection: 'row', gap: 10 }}>
          {editing ? (
            <>
              <Pressable
                onPress={() => { setEditing(false); setError(null); }}
                disabled={saving}
                style={({ pressed }) => [styles.cancelBtn, pressed && { opacity: 0.85 }]}
              >
                <Text style={styles.cancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={onSave}
                disabled={saving}
                style={({ pressed }) => [styles.deployBtn, { flex: 1 }, (pressed || saving) && { opacity: 0.85 }]}
              >
                {saving ? (
                  <ActivityIndicator color="#f4f1ea" size="small" />
                ) : (
                  <Text style={styles.deployText}>{isFarmer ? 'Save' : 'Save brief'}</Text>
                )}
              </Pressable>
            </>
          ) : (
            <Pressable
              onPress={onToggle}
              disabled={busy || !config}
              style={({ pressed }) => [
                styles.deployBtn,
                { flex: 1 },
                config?.active && styles.pauseBtn,
                (pressed || busy) && { opacity: 0.85 },
              ]}
            >
              {busy ? (
                <ActivityIndicator color="#f4f1ea" size="small" />
              ) : (
                <>
                  <IconBolt size={17} fill="#f4f1ea" stroke="none" />
                  <Text style={styles.deployText}>
                    {' '}{config?.active ? (isFarmer ? 'Pause helper' : 'Pause agent') : (isFarmer ? 'Start helper' : 'Deploy agent')}
                  </Text>
                </>
              )}
            </Pressable>
          )}
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: design.bg },
  titlePad: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 6 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  h1: { marginTop: 8, fontFamily: font.sansMed, fontSize: 27, letterSpacing: -0.7, color: design.ink },
  h1Serif: { fontFamily: font.serifItalic, fontSize: 30, color: colors.forest },

  errorText: { fontFamily: font.sans, fontSize: 13, color: colors.ember, paddingHorizontal: 20, paddingTop: 8 },

  card: { backgroundColor: design.paper, borderWidth: 1, borderColor: design.line, borderRadius: 16, padding: 16 },
  briefTag: { fontSize: 10.5, color: colors.sage, letterSpacing: 0.8 },
  briefBody: { marginTop: 8, fontFamily: font.sans, fontSize: 15, lineHeight: 22.5, color: design.ink },
  b: { fontFamily: font.sansSemi },

  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 6 },
  noOverride: { fontSize: 11, color: design.ink3 },
  calibrateLink: { fontSize: 11.5, color: colors.ember, letterSpacing: 0.5 },
  guardCard: { backgroundColor: design.paper, borderWidth: 1, borderColor: design.line, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 4 },
  guardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 },
  guardLabel: { fontSize: 11, color: design.ink3, letterSpacing: 0.55 },
  guardVal: { fontFamily: font.monoSemi, fontSize: 14 },
  track: { height: 5, backgroundColor: design.paper2, borderRadius: 3, justifyContent: 'center' },
  trackFill: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 3 },
  knob: { position: 'absolute', width: 18, height: 18, marginLeft: -9, borderRadius: 999, backgroundColor: '#fff', borderWidth: 2, shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  divider: { borderTopWidth: 1, borderTopColor: design.lineLight },

  styleRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16 },
  styleCell: {
    flex: 1, backgroundColor: design.paper, borderWidth: 1, borderColor: design.line,
    borderRadius: 12, paddingVertical: 12, paddingHorizontal: 10,
  },
  styleCellActive: { borderColor: colors.forest, backgroundColor: 'rgba(31,45,24,0.05)' },
  styleLabel: { fontFamily: font.sansSemi, fontSize: 13.5, color: design.ink },
  styleDesc: { fontSize: 10, color: design.ink3, marginTop: 3 },

  inputLabel: { fontFamily: font.sansMed, fontSize: 12.5, color: design.ink2, marginBottom: 6 },
  input: {
    borderWidth: 1, borderColor: design.line, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 11, fontSize: 16,
    fontFamily: font.sans, color: design.ink, backgroundColor: design.bg,
    marginBottom: 14,
  },
  switchRow: { flexDirection: 'row', alignItems: 'center', paddingTop: 2 },
  switchHint: { fontFamily: font.sans, fontSize: 12, color: design.ink3, marginTop: -2 },

  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16 },
  cpChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 999 },
  cpChipIdle: { backgroundColor: design.paper, borderWidth: 1, borderColor: design.line },
  cpChipActive: { backgroundColor: colors.forest, borderWidth: 1, borderColor: colors.forest },
  cpText: { fontFamily: font.sansMed, fontSize: 12.5 },

  bottomBar: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingTop: 12, paddingBottom: 14, backgroundColor: 'rgba(244,241,234,0.97)', borderTopWidth: 1, borderTopColor: design.line },
  deployBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 15, borderRadius: 12, backgroundColor: colors.forest },
  pauseBtn: { backgroundColor: colors.ember },
  cancelBtn: {
    alignItems: 'center', justifyContent: 'center', paddingVertical: 15, paddingHorizontal: 22,
    borderRadius: 12, borderWidth: 1, borderColor: design.line, backgroundColor: design.paper,
  },
  cancelText: { fontFamily: font.sansSemi, fontSize: 15.5, color: design.ink2 },
  deployText: { fontFamily: font.sansSemi, fontSize: 15.5, color: '#f4f1ea' },
});
