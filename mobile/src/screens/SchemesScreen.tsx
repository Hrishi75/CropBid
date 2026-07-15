// =============================================================================
// Schemes screen — Sarkari Yojana, searchable (mirrors the web's /schemes)
// =============================================================================
// A farmer-first catalogue of government schemes: what you get, who
// qualifies, how to apply, and the official link — in simple words. Search
// works in English, Hinglish and Hindi ("bima", "कर्ज", "pension"); the
// catalogue comes from /api/schemes once and filters locally as you type.
// Tapping a scheme expands the full detail with an "Official site" button.

import React, { useEffect, useMemo, useState } from 'react';
import { Linking, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import api from '../api/client';
import { IconSearch } from '../components/icons';
import { Mono } from '../components/buyerKit';
import { PressScale, glide } from '../components/motion';
import { colors, design, font } from '../theme';

// --- data shapes (mirror server/src/services/schemes.service.ts) ---

interface Scheme {
  slug: string;
  name: string;
  hindiName: string;
  emoji: string;
  category: string;
  tagline: string;
  benefit: string;
  eligibility: string;
  apply: string;
  link: string;
  keywords: string;
}

interface SchemesData {
  count: number;
  categories: Record<string, string>;
  schemes: Scheme[];
}

function matches(s: Scheme, needle: string, categories: Record<string, string>): boolean {
  return [s.name, s.hindiName, s.tagline, s.benefit, s.eligibility, s.apply, s.keywords, categories[s.category] ?? '']
    .join(' ')
    .toLowerCase()
    .includes(needle);
}

// One expanded detail block: what you get / who qualifies / how to apply.
function DetailBlock({ label, body }: { label: string; body: string }) {
  return (
    <View style={styles.block}>
      <Mono style={styles.blockLabel}>{label.toUpperCase()}</Mono>
      <Text style={styles.blockBody}>{body}</Text>
    </View>
  );
}

export default function SchemesScreen() {
  const [data, setData] = useState<SchemesData | null>(null);
  const [failed, setFailed] = useState(false);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    let on = true;
    api.get('/schemes')
      .then(({ data }) => { if (on) { glide(); setData(data); } })
      .catch(() => { if (on) setFailed(true); });
    return () => { on = false; };
  }, []);

  const results = useMemo(() => {
    if (!data) return [];
    let out = data.schemes;
    if (cat) out = out.filter((s) => s.category === cat);
    const needle = q.trim().toLowerCase();
    if (needle) out = out.filter((s) => matches(s, needle, data.categories));
    return out;
  }, [data, q, cat]);

  return (
    <View style={styles.flex}>
      {/* search + category chips */}
      <View style={styles.top}>
        <View style={styles.searchBar}>
          <IconSearch size={17} stroke={design.ink3} />
          <TextInput
            style={styles.searchInput}
            value={q}
            onChangeText={(t) => { setQ(t); setOpen(null); }}
            placeholder='Try "bima", "loan", "पेंशन", "solar"…'
            placeholderTextColor={design.ink3}
            autoCapitalize="none"
            returnKeyType="search"
          />
        </View>
        {data ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsPad}>
            {[['', 'All schemes'], ...Object.entries(data.categories)].map(([id, label]) => {
              const on = cat === id;
              return (
                <PressScale
                  key={id || 'all'}
                  onPress={() => { glide(); setCat(on && id !== '' ? '' : id); setOpen(null); }}
                  scaleTo={0.94}
                  cardStyle={[styles.chip, on && styles.chipOn]}
                >
                  <Text style={[styles.chipText, on && styles.chipTextOn]}>{label}</Text>
                </PressScale>
              );
            })}
          </ScrollView>
        ) : null}
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollPad}>
        {failed && <Text style={styles.note}>Could not load the schemes catalogue — check your connection and try again.</Text>}
        {!data && !failed && <Text style={styles.note}>Loading schemes…</Text>}
        {data && results.length === 0 && (
          <Text style={styles.note}>Nothing matches “{q}”. Try a simpler word — “loan”, “bima”, “pension”, “solar”.</Text>
        )}

        {results.map((s) => {
          const isOpen = open === s.slug;
          return (
            <View key={s.slug} style={[styles.card, isOpen && styles.cardOpen]}>
              <PressScale onPress={() => { glide(); setOpen(isOpen ? null : s.slug); }} scaleTo={0.98}>
                <View style={styles.cardRow}>
                  <Text style={styles.cardEmoji}>{s.emoji}</Text>
                  <View style={styles.cardMain}>
                    <View style={styles.cardTitleRow}>
                      <Text style={styles.cardName}>{s.name}</Text>
                      <Mono style={styles.cardCat}>{(data?.categories[s.category] ?? '').toUpperCase()}</Mono>
                    </View>
                    <Text style={styles.cardHindi}>{s.hindiName}</Text>
                    <Text style={styles.cardTagline}>{s.tagline}</Text>
                  </View>
                </View>
                <Text style={styles.cardMore}>{isOpen ? 'hide details ↑' : 'what you get & how to apply ↓'}</Text>
              </PressScale>

              {isOpen && (
                <View style={styles.detail}>
                  <DetailBlock label="What you get" body={s.benefit} />
                  <DetailBlock label="Who qualifies" body={s.eligibility} />
                  <DetailBlock label="How to apply" body={s.apply} />
                  <PressScale onPress={() => Linking.openURL(s.link)} cardStyle={styles.linkBtn}>
                    <Text style={styles.linkBtnText}>Open official site →</Text>
                  </PressScale>
                </View>
              )}
            </View>
          );
        })}

        {data && (
          <Text style={styles.foot}>
            Simplified summaries — amounts and rules can change, and some states add their own
            top-ups. The official site on each scheme is the source of truth. Applying is free or
            near-free: never pay an agent to “get you” a government scheme.
          </Text>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: design.bg },

  top: { backgroundColor: design.paper, borderBottomWidth: 1, borderBottomColor: design.line, paddingTop: 10 },
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
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  cardName: { fontFamily: font.sansSemi, fontSize: 14.5, color: design.ink },
  cardCat: { fontSize: 7.5, letterSpacing: 0.6, color: design.ink3 },
  cardHindi: { fontFamily: font.sans, fontSize: 11.5, color: design.ink3, marginTop: 1 },
  cardTagline: { fontFamily: font.sans, fontSize: 12.5, lineHeight: 17, color: design.ink2, marginTop: 5 },
  cardMore: { fontFamily: font.sans, fontSize: 11, color: colors.sage, marginTop: 9 },

  detail: { marginTop: 10, borderTopWidth: 1, borderTopColor: design.line, paddingTop: 10, gap: 8 },
  block: { backgroundColor: design.bg, borderWidth: 1, borderColor: design.line, borderRadius: 10, padding: 11 },
  blockLabel: { fontSize: 8.5, letterSpacing: 0.8, color: design.ink3 },
  blockBody: { fontFamily: font.sans, fontSize: 12.5, lineHeight: 18, color: design.ink2, marginTop: 5 },
  linkBtn: {
    backgroundColor: colors.forest, borderRadius: 10,
    paddingVertical: 11, alignItems: 'center', marginTop: 2,
  },
  linkBtnText: { fontFamily: font.sansSemi, fontSize: 13, color: '#f4f1ea' },

  note: { fontFamily: font.sans, fontSize: 12.5, color: design.ink3, paddingHorizontal: 16, paddingVertical: 12 },
  foot: {
    fontFamily: font.sans, fontSize: 11, lineHeight: 15, color: design.ink3,
    paddingHorizontal: 16, marginTop: 20,
  },
});
