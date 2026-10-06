// =============================================================================
// RestockListScreen — a store posts its shopping list in one go
// =============================================================================
// A retailer restocks many items at once, for one store and one day. This is
// that list: a row per crop (name, how much, unit, grade, your price), one
// delivery address and date for all of them, and optionally a repeat.
//
// Sent as one POST /requirements/list. The server makes each row an ordinary
// request (so sellers offer on the items they have, and every offer, counter
// and deal works as it does for one request) and posts all of them or none.
//
// Offered to retailers from Requests and the dashboard; "Just one crop?" goes
// to the single-request form.
// =============================================================================

import React, { useState } from 'react';
import {
  KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Alert } from '../../lib/alert';
import { Mono } from '../../components/buyerKit';
import { Button } from '../../components/ui';
import { createRequirementList } from '../../api/endpoints';
import { errorMessage } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import type { QualityGrade, Unit } from '../../api/types';
import { money, unitLabel } from '../../lib/format';
import { colors, design, font } from '../../theme';

interface Row { key: number; crop: string; qty: string; unit: Unit; grade: QualityGrade; price: string }

const UNITS: Unit[] = ['QUINTAL', 'KG', 'TONNE'];
const GRADES: QualityGrade[] = ['A', 'B', 'C'];
const MAX = 15;
// A different example on each row: the same grey "Onion 20" on all three read
// as three identical rows already filled in.
const EXAMPLES = [['Onion', '20', '1800'], ['Tomato', '10', '1500'], ['Potato', '15', '1200'], ['Garlic', '2', '9000']];
const num = (v: string) => v.replace(/[^0-9.]/g, '');
let nextKey = 1;
const blank = (): Row => ({ key: nextKey++, crop: '', qty: '', unit: 'QUINTAL', grade: 'A', price: '' });
// Tapping a chip moves to the next value: three units and three grades fit a
// row only this way on a phone.
const cycle = <T,>(list: T[], v: T) => list[(list.indexOf(v) + 1) % list.length];

export default function RestockListScreen() {
  const nav = useNavigation<any>();
  const { user } = useAuth();

  const [name, setName] = useState('');
  const [rows, setRows] = useState<Row[]>([blank(), blank(), blank()]);
  const [city, setCity] = useState(user?.location ?? '');
  const [state, setState] = useState('');
  const [neededBy, setNeededBy] = useState('');
  const [repeat, setRepeat] = useState<number | null>(7);
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (key: number, patch: Partial<Row>) => {
    setError(null);
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  };
  // A row counts once it has a crop; empty rows are ignored rather than refused.
  const filled = rows.filter((r) => r.crop.trim());
  const total = filled.reduce((s, r) => s + (Number(r.qty) || 0) * (Number(r.price) || 0), 0);

  function validate(): string | null {
    if (filled.length < 2) return 'Add at least two crops. For one, post a single request.';
    const seen = new Set<string>();
    for (const r of filled) {
      const c = r.crop.trim();
      if (seen.has(c.toLowerCase())) return `${c} is on the list twice. Add the quantities together.`;
      seen.add(c.toLowerCase());
      if (!(Number(r.qty) > 0)) return `How much ${c}?`;
      if (!(Number(r.price) > 0)) return `What will you pay for ${c}?`;
    }
    if (!city.trim() || !state.trim()) return 'Which store should it go to? Enter the city and state.';
    if (neededBy.trim() && !/^\d{4}-\d{2}-\d{2}$/.test(neededBy.trim())) return 'Write the date as YYYY-MM-DD, or leave it blank';
    return null;
  }

  async function send() {
    const problem = validate();
    if (problem) { setError(problem); return; }
    setSending(true);
    try {
      const out = await createRequirementList({
        listName: name.trim() || null,
        items: filled.map((r) => ({
          cropName: r.crop.trim(),
          quantity: Number(r.qty),
          unit: r.unit,
          qualityGrade: r.grade,
          pricePerUnit: Number(r.price),
        })),
        deliveryLocation: city.trim(),
        deliveryState: state.trim(),
        neededBy: neededBy.trim() || undefined,
        description: note.trim() || undefined,
        repeatEveryDays: repeat,
      });
      Alert.alert(
        'List posted',
        `${out.requirements.length} items are up. Sellers offer on the ones they have; offers arrive under each item in Requests.`,
        [{ text: 'OK', onPress: () => nav.goBack() }],
      );
    } catch (e) {
      setError(errorMessage(e, 'Could not post the list'));
    } finally {
      setSending(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
        <Text style={styles.intro}>
          Everything the store needs, for one delivery. Each item goes to the sellers who grow it, and you take offers item by item.
        </Text>

        <View style={styles.card}>
          <Mono style={styles.eyebrow}>THE LIST</Mono>
          <TextInput style={styles.input} value={name} onChangeText={setName} maxLength={80} placeholder="Name it (optional), e.g. Weekly veg, Karol Bagh" placeholderTextColor={design.ink3} />

          <View style={styles.headRow}>
            <Text style={[styles.colHead, { flex: 1.6 }]}>Crop</Text>
            <Text style={[styles.colHead, { flex: 1.3 }]}>How much</Text>
            <Text style={[styles.colHead, { flex: 1 }]}>₹ / unit</Text>
            <View style={{ width: 24 }} />
          </View>

          {rows.map((r, idx) => {
            const ex = EXAMPLES[idx % EXAMPLES.length];
            return (
            <View key={r.key} style={styles.row}>
              <View style={{ flex: 1.6, gap: 5 }}>
                <TextInput style={styles.cell} value={r.crop} onChangeText={(v) => set(r.key, { crop: v })} placeholder={ex[0]} placeholderTextColor={design.ink3} autoCapitalize="words" />
                <Pressable onPress={() => set(r.key, { grade: cycle(GRADES, r.grade) })} style={styles.chip}>
                  <Text style={styles.chipText}>Grade {r.grade}</Text>
                </Pressable>
              </View>
              <View style={{ flex: 1.3, gap: 5 }}>
                <TextInput style={styles.cell} value={r.qty} onChangeText={(v) => set(r.key, { qty: num(v) })} keyboardType="decimal-pad" placeholder={ex[1]} placeholderTextColor={design.ink3} />
                <Pressable onPress={() => set(r.key, { unit: cycle(UNITS, r.unit) })} style={styles.chip}>
                  <Text style={styles.chipText}>{unitLabel(r.unit)} ⇄</Text>
                </Pressable>
              </View>
              <View style={{ flex: 1, gap: 5 }}>
                <TextInput style={styles.cell} value={r.price} onChangeText={(v) => set(r.key, { price: num(v) })} keyboardType="decimal-pad" placeholder={ex[2]} placeholderTextColor={design.ink3} />
                <Text style={styles.per}>per {unitLabel(r.unit)}</Text>
              </View>
              <Pressable
                onPress={() => setRows((rs) => (rs.length > 2 ? rs.filter((x) => x.key !== r.key) : rs.map((x) => (x.key === r.key ? blank() : x))))}
                hitSlop={8}
                style={styles.remove}
                accessibilityLabel="Remove this item"
              >
                <Text style={styles.removeText}>×</Text>
              </Pressable>
            </View>
            );
          })}

          {rows.length < MAX ? (
            <Pressable onPress={() => setRows((rs) => [...rs, blank()])} style={styles.add}>
              <Text style={styles.addText}>+ Add an item</Text>
            </Pressable>
          ) : null}

          {total > 0 ? (
            <Text style={styles.total}>{filled.length} items · about {money(total)} at your prices</Text>
          ) : null}
        </View>

        <View style={styles.card}>
          <Mono style={styles.eyebrow}>WHERE, AND WHEN</Mono>
          <View style={styles.twoCol}>
            <TextInput style={[styles.input, { flex: 1 }]} value={city} onChangeText={(v) => { setError(null); setCity(v); }} placeholder="Store city" placeholderTextColor={design.ink3} />
            <TextInput style={[styles.input, { flex: 1 }]} value={state} onChangeText={(v) => { setError(null); setState(v); }} placeholder="State" placeholderTextColor={design.ink3} />
          </View>
          <TextInput style={styles.input} value={neededBy} onChangeText={setNeededBy} placeholder="Needed by YYYY-MM-DD (optional)" placeholderTextColor={design.ink3} autoCapitalize="none" />
          <Text style={styles.label}>How often</Text>
          <View style={styles.pills}>
            {([null, 3, 7, 14] as const).map((d) => (
              <Pressable key={String(d)} onPress={() => setRepeat(d)} style={[styles.pill, repeat === d && styles.pillOn]}>
                <Text style={[styles.pillText, repeat === d && styles.pillTextOn]}>
                  {d == null ? 'Just once' : d === 7 ? 'Every week' : d === 14 ? 'Every 2 weeks' : `Every ${d} days`}
                </Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.hint}>
            {repeat ? `The whole list posts again every ${repeat} days with the full quantities.` : 'Posted once.'}
          </Text>
          <TextInput style={[styles.input, { minHeight: 64 }]} value={note} onChangeText={setNote} multiline maxLength={2000} placeholder="A note for sellers (optional): packing, unloading hours…" placeholderTextColor={design.ink3} />
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Button label={`Post the list${filled.length >= 2 ? ` · ${filled.length} items` : ''}`} onPress={send} loading={sending} />
        <Pressable onPress={() => nav.replace('CreateRequirement')} hitSlop={8}>
          <Text style={styles.single}>Just one crop? Post a single request</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: design.bg },
  body: { padding: 14, gap: 12, paddingBottom: 40 },
  intro: { fontFamily: font.sans, fontSize: 13.5, lineHeight: 20, color: design.ink2, paddingHorizontal: 2 },
  card: { backgroundColor: design.paper, borderRadius: 14, borderWidth: 1, borderColor: design.line, padding: 14, gap: 10 },
  eyebrow: { fontSize: 10, letterSpacing: 0.7, color: design.ink3 },
  input: {
    borderWidth: 1, borderColor: design.line, borderRadius: 11, paddingHorizontal: 12, paddingVertical: 11,
    fontFamily: font.sans, fontSize: 14.5, color: design.ink, backgroundColor: design.bg,
  },
  headRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  colHead: { fontFamily: font.sansSemi, fontSize: 12, color: design.ink2 },
  row: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', paddingTop: 8, borderTopWidth: 1, borderTopColor: design.lineLight },
  cell: {
    borderWidth: 1, borderColor: design.line, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 9,
    fontFamily: font.sans, fontSize: 14, color: design.ink, backgroundColor: design.bg,
  },
  chip: { alignSelf: 'flex-start', backgroundColor: design.paper2, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4 },
  chipText: { fontFamily: font.sansMed, fontSize: 11.5, color: design.ink2 },
  per: { fontFamily: font.sans, fontSize: 11.5, color: design.ink3, paddingLeft: 2, paddingTop: 3 },
  remove: { width: 24, height: 38, alignItems: 'center', justifyContent: 'center' },
  removeText: { fontFamily: font.sansSemi, fontSize: 18, color: design.ink3 },
  add: { alignSelf: 'flex-start', paddingVertical: 6 },
  addText: { fontFamily: font.sansSemi, fontSize: 14, color: colors.forest },
  total: { fontFamily: font.sansBold, fontSize: 14.5, color: design.ink },
  twoCol: { flexDirection: 'row', gap: 8 },
  label: { fontFamily: font.sansSemi, fontSize: 12.5, color: design.ink2 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  pill: { borderWidth: 1, borderColor: design.line, backgroundColor: design.bg, borderRadius: 999, paddingHorizontal: 13, paddingVertical: 8 },
  pillOn: { backgroundColor: colors.forest, borderColor: colors.forest },
  pillText: { fontFamily: font.sansMed, fontSize: 12.5, color: design.ink2 },
  pillTextOn: { color: colors.textInverse },
  hint: { fontFamily: font.sans, fontSize: 12, lineHeight: 17, color: design.ink3 },
  error: { fontFamily: font.sansMed, fontSize: 13, color: colors.error },
  single: { fontFamily: font.sansSemi, fontSize: 13.5, color: colors.forest, textAlign: 'center', paddingVertical: 6 },
});
