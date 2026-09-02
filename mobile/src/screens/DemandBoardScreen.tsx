// =============================================================================
// DemandBoardScreen — every open buyer requirement, for both sides
// =============================================================================
// The demand-side twin of the market: instead of farmers listing what they have,
// buyers post what they need and farmers answer.
//
// TWO AUDIENCES, ONE BOARD:
//   FARMER — this is work to win. Each card opens an action panel:
//     Fill    → POST /requirements/:id/accept — closes the deal on the spot at
//               the buyer's posted price
//     Counter → POST /requirements/:id/offers — proposes the farmer's own
//               price, which the buyer then accepts or rejects
//   BUYER  — read-only market intelligence: what else is being asked for, in
//     what volume, at what price. The actions are hidden here AND refused by
//     the server (both routes stay FARMER-only), so hiding is a courtesy, not
//     the security boundary. Competitor identity is redacted server-side too.
//
// Quantity defaults to the whole outstanding amount but stays editable, because
// requirements support partial fills.
//
// Mirrors client/src/pages/shared/DemandBoard.tsx, including which parameters
// the feed is narrowed by and how the sort order pairs with each sort key.
// =============================================================================

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Eyebrow, Mono } from '../components/buyerKit';
import { PressScale, glide } from '../components/motion';
import { RequirementCard } from '../components/RequirementCard';
import { RequirementAnswerPanel } from '../components/RequirementAnswerPanel';
import { IconSearch } from '../components/icons';
import { useAuth } from '../context/AuthContext';
import { requirementFeed, requirementFilters, type RequirementFeedParams } from '../api/endpoints';
import { errorMessage } from '../api/client';
import { companyTypeLabel } from '../lib/companyType';
import { money } from '../lib/format';
import type { BuyerRequirement, RequirementFilterOptions } from '../api/types';
import { colors, design, font } from '../theme';

const PAGE_SIZE = 12;

const SORTS: Array<{ key: NonNullable<RequirementFeedParams['sort']>; label: string }> = [
  { key: 'createdAt', label: 'Newest' },
  { key: 'pricePerUnit', label: 'Best price' },
  { key: 'quantity', label: 'Biggest' },
  { key: 'neededBy', label: 'Soonest' },
];

export default function DemandBoardScreen() {
  const nav = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const isFarmer = user?.role === 'FARMER';

  const [rows, setRows] = useState<BuyerRequirement[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [options, setOptions] = useState<RequirementFilterOptions>({});
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [crop, setCrop] = useState('');
  const [state, setState] = useState('');
  const [buyerType, setBuyerType] = useState('');
  const [sort, setSort] = useState<NonNullable<RequirementFeedParams['sort']>>('createdAt');

  // Which crops, states and buyer types the board actually holds — so a filter
  // can never be picked that returns nothing.
  useEffect(() => {
    let on = true;
    requirementFilters()
      .then((o) => { if (on) setOptions(o); })
      .catch(() => { /* the board still works unfiltered */ });
    return () => { on = false; };
  }, []);

  // Debounced, because the API is rate limited and a request per keystroke
  // would spend that budget on prefixes nobody searched for.
  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const params = useMemo<RequirementFeedParams>(() => ({
    limit: PAGE_SIZE,
    ...(query ? { search: query } : {}),
    ...(crop ? { crop } : {}),
    ...(state ? { state } : {}),
    ...(buyerType ? { buyerType } : {}),
    sort,
  }), [query, crop, state, buyerType, sort]);

  const load = useCallback(async (nextPage: number, mode: 'replace' | 'append') => {
    if (mode === 'append') setLoadingMore(true); else setLoading(true);
    try {
      const data = await requirementFeed({ ...params, page: nextPage });
      glide();
      setRows((prev) => (mode === 'append' ? [...prev, ...data.requirements] : data.requirements));
      setTotal(data.pagination.total);
      setTotalPages(data.pagination.totalPages);
      setPage(data.pagination.page);
      setError(null);
    } catch (e) {
      setError(errorMessage(e, 'Could not load the demand board'));
      if (mode === 'replace') setRows([]);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [params]);

  // Any filter change is a new first page, never an append.
  useEffect(() => { void load(1, 'replace'); }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load(1, 'replace');
    setRefreshing(false);
  }, [load]);

  const filtered = crop !== '' || state !== '' || buyerType !== '' || query !== '';

  return (
    <View style={styles.flex}>
      <View style={[styles.head, { paddingTop: insets.top + 12 }]}>
        <Eyebrow>DEMAND BOARD</Eyebrow>
        <Text style={styles.title}>
          {isFarmer ? 'What buyers are asking for.' : "What the market is asking for."}
        </Text>
        <Text style={styles.lede}>
          {isFarmer
            ? 'Fill one at the posted price, or counter with your own. Partial fills are fine.'
            : 'Read-only: volume, price and business type across the board. Names are withheld.'}
        </Text>

        <View style={styles.searchBar}>
          <IconSearch size={17} stroke={design.ink3} />
          <TextInput
            style={styles.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder="Search a crop or a place"
            placeholderTextColor={design.ink3}
            autoCorrect={false}
            returnKeyType="search"
          />
          {search ? (
            <Pressable onPress={() => setSearch('')} hitSlop={8}>
              <Text style={styles.clear}>✕</Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.body}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.forest} />
        }
      >
        <ChipRow
          label="SORT"
          items={SORTS.map((s) => ({ value: s.key, label: s.label }))}
          value={sort}
          onPick={(v) => setSort((v || 'createdAt') as NonNullable<RequirementFeedParams['sort']>)}
          allowClear={false}
        />
        {options.crops?.length ? (
          <ChipRow label="CROP" items={options.crops.map((c) => ({ value: c, label: c }))} value={crop} onPick={setCrop} />
        ) : null}
        {options.buyerTypes?.length ? (
          <ChipRow
            label="BUYER"
            items={options.buyerTypes.map((b) => ({ value: b, label: companyTypeLabel(b) ?? b }))}
            value={buyerType}
            onPick={setBuyerType}
          />
        ) : null}
        {options.states?.length ? (
          <ChipRow label="DELIVER TO" items={options.states.map((s) => ({ value: s, label: s }))} value={state} onPick={setState} />
        ) : null}

        <View style={styles.countRow}>
          <Mono style={styles.count}>
            {loading ? 'LOADING…' : `${total} OPEN ${total === 1 ? 'REQUIREMENT' : 'REQUIREMENTS'}`}
          </Mono>
          {filtered ? (
            <Pressable
              hitSlop={8}
              onPress={() => { setSearch(''); setQuery(''); setCrop(''); setState(''); setBuyerType(''); }}
            >
              <Text style={styles.clearAll}>Clear filters</Text>
            </Pressable>
          ) : null}
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {!loading && rows.length === 0 && !error ? (
          <View style={styles.empty}>
            <Text style={styles.emptyEmoji}>📋</Text>
            <Text style={styles.emptyTitle}>
              {filtered ? 'Nothing matches those filters' : 'No open demand right now'}
            </Text>
            <Text style={styles.emptyBody}>
              {filtered
                ? 'Clear a filter and look again — the board moves fast.'
                : 'Buyers post here when they need a crop. Pull down to check again.'}
            </Text>
          </View>
        ) : null}

        {rows.map((r) => (
          <BoardRow
            key={r.id}
            requirement={r}
            isFarmer={isFarmer}
            onOpen={() => nav.navigate('RequirementDetail', { id: r.id, preview: r })}
            onDone={() => load(1, 'replace')}
          />
        ))}

        {page < totalPages ? (
          <PressScale
            onPress={loadingMore ? undefined : () => load(page + 1, 'append')}
            cardStyle={styles.moreBtn}
          >
            <Text style={styles.moreText}>{loadingMore ? 'Loading…' : 'Load more'}</Text>
          </PressScale>
        ) : null}
      </ScrollView>
    </View>
  );
}

// One horizontal rail of single-select filter chips. Picking the chip that is
// already on clears it, which is how a phone user expects a filter row to work.
function ChipRow({
  label, items, value, onPick, allowClear = true,
}: {
  label: string;
  items: Array<{ value: string; label: string }>;
  value: string;
  onPick: (next: string) => void;
  allowClear?: boolean;
}) {
  return (
    <View style={styles.chipRow}>
      <Mono style={styles.chipRowLabel}>{label}</Mono>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRowPad}>
        {items.map((it) => {
          const on = value === it.value;
          return (
            <Pressable
              key={it.value}
              onPress={() => onPick(on && allowClear ? '' : it.value)}
              style={[styles.chip, on && styles.chipOn]}
            >
              <Text style={[styles.chipText, on && styles.chipTextOn]} numberOfLines={1}>{it.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

// A card plus, for a farmer, the inline panel that answers it.
function BoardRow({
  requirement: r, isFarmer, onOpen, onDone,
}: {
  requirement: BuyerRequirement;
  isFarmer: boolean;
  onOpen: () => void;
  onDone: () => void;
}) {
  const [mode, setMode] = useState<'fill' | 'counter' | null>(null);

  // Only an OPEN requirement can still be answered. A closed or fully filled
  // one stays on the board as a record, without buttons that would 409.
  const answerable = isFarmer && r.status === 'OPEN' && r.remainingQuantity > 0;

  return (
    <RequirementCard requirement={r} onPress={mode ? undefined : onOpen} showMspWarning={isFarmer}>
      {answerable ? (
        <View style={styles.actions}>
          <Pressable
            onPress={() => setMode(mode === 'fill' ? null : 'fill')}
            style={[styles.actionBtn, styles.actionPrimary, mode === 'fill' && styles.actionOn]}
          >
            <Text style={[styles.actionText, styles.actionTextPrimary]}>
              Fill at {money(r.pricePerUnit, r.currency)}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setMode(mode === 'counter' ? null : 'counter')}
            style={[styles.actionBtn, mode === 'counter' && styles.actionOn]}
          >
            <Text style={styles.actionText}>Counter</Text>
          </Pressable>
        </View>
      ) : null}

      {answerable && mode ? (
        <RequirementAnswerPanel requirement={r} mode={mode} onClose={() => setMode(null)} onDone={onDone} />
      ) : null}
    </RequirementCard>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: design.bg },
  head: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: design.bg,
    borderBottomWidth: 1,
    borderBottomColor: design.line,
  },
  title: { fontFamily: font.sansBold, fontSize: 22, letterSpacing: -0.5, color: design.ink, marginTop: 6 },
  lede: { fontFamily: font.sans, fontSize: 12.5, lineHeight: 18, color: design.ink3, marginTop: 4 },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: design.paper,
    borderWidth: 1,
    borderColor: design.line,
    borderRadius: 12,
    paddingHorizontal: 12,
    marginTop: 12,
  },
  searchInput: { flex: 1, paddingVertical: 10, fontFamily: font.sans, fontSize: 14.5, color: design.ink },
  clear: { fontFamily: font.sansBold, fontSize: 14, color: design.ink3, paddingHorizontal: 2 },

  body: { padding: 14, gap: 12, paddingBottom: 32 },

  chipRow: { gap: 6 },
  chipRowLabel: { fontSize: 9.5, letterSpacing: 0.7, color: design.ink3, paddingHorizontal: 2 },
  chipRowPad: { gap: 7, paddingRight: 14 },
  chip: {
    backgroundColor: design.paper,
    borderWidth: 1,
    borderColor: design.line,
    borderRadius: 999,
    paddingHorizontal: 13,
    paddingVertical: 7,
  },
  chipOn: { backgroundColor: colors.forest, borderColor: colors.forest },
  chipText: { fontFamily: font.sansMed, fontSize: 12.5, color: design.ink2 },
  chipTextOn: { color: colors.textInverse },

  countRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 4 },
  count: { fontSize: 10, letterSpacing: 0.7, color: design.ink3 },
  clearAll: { fontFamily: font.sansSemi, fontSize: 12, color: colors.ember },

  error: { fontFamily: font.sansMed, fontSize: 12.5, color: colors.error, marginTop: 6 },

  empty: { alignItems: 'center', gap: 7, paddingVertical: 44, paddingHorizontal: 24 },
  emptyEmoji: { fontSize: 34 },
  emptyTitle: { fontFamily: font.sansBold, fontSize: 16, color: design.ink, textAlign: 'center' },
  emptyBody: { fontFamily: font.sans, fontSize: 13, lineHeight: 19, color: design.ink3, textAlign: 'center' },

  actions: { flexDirection: 'row', gap: 9 },
  actionBtn: {
    flex: 1,
    borderWidth: 1.3,
    borderColor: colors.forest,
    borderRadius: 11,
    paddingVertical: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionPrimary: { backgroundColor: colors.forest },
  actionOn: { opacity: 0.75 },
  actionText: { fontFamily: font.sansBold, fontSize: 13, color: colors.forest },
  actionTextPrimary: { color: colors.textInverse },


  moreBtn: {
    borderWidth: 1.3,
    borderColor: colors.forest,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: 4,
  },
  moreText: { fontFamily: font.sansBold, fontSize: 13.5, color: colors.forest },
});
