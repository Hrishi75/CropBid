// =============================================================================
// CreateRequirementScreen — a buyer posts what they need
// =============================================================================
// The other direction of the exchange: instead of bidding on what a farmer
// happens to have listed, a buyer states the crop, the volume, the grade, the
// price and the deadline, and farmers answer it.
//
// WHY THE CURRENCY IS ALWAYS INR. Platform money is rupee-native: prices here
// are typed against ₹ MSP and mandi anchors, so a requirement is stored in INR
// whatever the account's display currency is. Same rule as the web form.
//
// THE MSP WARNING IS A WARNING, NOT A BLOCK. Posting under the government
// support price is legal and sometimes deliberate, but it is also the single
// best predictor that no farmer will answer — so it is said plainly, once,
// before the post goes out.
//
// Mirrors client/src/pages/buyer/CreateRequirement.tsx.
// =============================================================================

import React, { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Mono } from '../../components/buyerKit';
import { Button } from '../../components/ui';
import { createRequirement } from '../../api/endpoints';
import { errorMessage } from '../../api/client';
import { mspForCrop } from '../../lib/msp';
import { money, unitLabel } from '../../lib/format';
import type { QualityGrade, Unit } from '../../api/types';
import { colors, design, font } from '../../theme';

const UNITS: Unit[] = ['KG', 'QUINTAL', 'TONNE'];
const GRADES: QualityGrade[] = ['A', 'B', 'C'];

export default function CreateRequirementScreen() {
  const nav = useNavigation<any>();

  const [cropName, setCropName] = useState('');
  const [cropVariety, setCropVariety] = useState('');
  const [quantity, setQuantity] = useState('');
  const [unit, setUnit] = useState<Unit>('QUINTAL');
  const [qualityGrade, setQualityGrade] = useState<QualityGrade>('A');
  const [pricePerUnit, setPricePerUnit] = useState('');
  const [deliveryLocation, setDeliveryLocation] = useState('');
  const [deliveryState, setDeliveryState] = useState('');
  const [neededBy, setNeededBy] = useState('');
  const [description, setDescription] = useState('');
  const [organic, setOrganic] = useState(false);
  const [paymentTerms, setPaymentTerms] = useState('');
  const [deliveryTerms, setDeliveryTerms] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const qty = Number(quantity);
  const price = Number(pricePerUnit);
  const total = qty > 0 && price > 0 ? qty * price : 0;

  // Free text, so it needs a shape check before it becomes a date the server
  // has to parse. Empty is fine — a requirement without a deadline is open.
  const dateOk = neededBy.trim() === '' || /^\d{4}-\d{2}-\d{2}$/.test(neededBy.trim());

  function validate(): string | null {
    if (!cropName.trim()) return 'Which crop do you need?';
    if (!(qty > 0)) return 'Enter how much you need';
    if (!(price > 0)) return 'Enter what you will pay per unit';
    if (!deliveryLocation.trim()) return 'Where should it be delivered?';
    if (!deliveryState.trim()) return 'Which state is that in?';
    if (!dateOk) return 'Write the date as YYYY-MM-DD, or leave it blank';
    return null;
  }

  function onSubmit() {
    const problem = validate();
    if (problem) { setError(problem); return; }
    setError(null);

    const msp = mspForCrop(cropName.trim(), unit);
    if (msp != null && price < msp) {
      Alert.alert(
        'Below the government MSP',
        `The MSP for ${cropName.trim()} is ${money(msp)}/${unitLabel(unit)}. Your price of ` +
          `${money(price)} is under it — you would be asking farmers to sell below the support ` +
          'price, and many will simply skip it.',
        [
          { text: 'Raise my price', style: 'cancel' },
          { text: 'Post anyway', style: 'destructive', onPress: post },
        ],
      );
      return;
    }
    post();
  }

  async function post() {
    setSubmitting(true);
    try {
      await createRequirement({
        cropName: cropName.trim(),
        cropVariety: cropVariety.trim() || undefined,
        quantity: qty,
        unit,
        qualityGrade,
        pricePerUnit: price,
        currency: 'INR',
        deliveryLocation: deliveryLocation.trim(),
        deliveryState: deliveryState.trim(),
        neededBy: neededBy.trim() || undefined,
        description: description.trim() || undefined,
        organic,
        paymentTerms: paymentTerms.trim() || undefined,
        deliveryTerms: deliveryTerms.trim() || undefined,
      });
      Alert.alert(
        'Requirement posted',
        'Farmers who can supply it have been notified. Offers arrive under your demand.',
        [{ text: 'OK', onPress: () => nav.goBack() }],
      );
    } catch (e) {
      setError(errorMessage(e, 'Could not post that requirement'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <Mono style={styles.eyebrow}>WHAT DO YOU NEED?</Mono>

          <Field label="Crop">
            <TextInput
              style={styles.input}
              value={cropName}
              onChangeText={(t) => { setError(null); setCropName(t); }}
              placeholder="Tomato, wheat, turmeric…"
              placeholderTextColor={design.ink3}
              autoCapitalize="words"
            />
          </Field>

          <Field label="Variety (optional)">
            <TextInput
              style={styles.input}
              value={cropVariety}
              onChangeText={setCropVariety}
              placeholder="Nashik red, sharbati…"
              placeholderTextColor={design.ink3}
            />
          </Field>

          <Field label="Unit">
            <View style={styles.pillRow}>
              {UNITS.map((u) => (
                <Pressable key={u} onPress={() => setUnit(u)} style={[styles.pill, unit === u && styles.pillOn]}>
                  <Text style={[styles.pillText, unit === u && styles.pillTextOn]}>{unitLabel(u)}</Text>
                </Pressable>
              ))}
            </View>
          </Field>

          <View style={styles.row}>
            <View style={styles.rowField}>
              <Field label={`Quantity (${unitLabel(unit)})`}>
                <TextInput
                  style={styles.input}
                  value={quantity}
                  onChangeText={(t) => { setError(null); setQuantity(t); }}
                  keyboardType="numeric"
                  placeholder="500"
                  placeholderTextColor={design.ink3}
                />
              </Field>
            </View>
            <View style={styles.rowField}>
              <Field label={`₹ per ${unitLabel(unit)}`}>
                <TextInput
                  style={styles.input}
                  value={pricePerUnit}
                  onChangeText={(t) => { setError(null); setPricePerUnit(t); }}
                  keyboardType="numeric"
                  placeholder="2200"
                  placeholderTextColor={design.ink3}
                />
              </Field>
            </View>
          </View>

          <Field label="Minimum grade">
            <View style={styles.pillRow}>
              {GRADES.map((g) => (
                <Pressable
                  key={g}
                  onPress={() => setQualityGrade(g)}
                  style={[styles.pill, qualityGrade === g && styles.pillOn]}
                >
                  <Text style={[styles.pillText, qualityGrade === g && styles.pillTextOn]}>Grade {g}</Text>
                </Pressable>
              ))}
            </View>
          </Field>

          <View style={styles.switchRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.switchLabel}>Organic only</Text>
              <Text style={styles.switchHint}>Only certified-organic lots can answer.</Text>
            </View>
            <Switch
              value={organic}
              onValueChange={setOrganic}
              trackColor={{ true: colors.sage, false: design.line }}
              thumbColor={design.paper}
            />
          </View>

          {total > 0 ? <Text style={styles.total}>Order value {money(total)}</Text> : null}
        </View>

        <View style={styles.card}>
          <Mono style={styles.eyebrow}>WHERE, AND BY WHEN</Mono>

          <View style={styles.row}>
            <View style={styles.rowField}>
              <Field label="Deliver to">
                <TextInput
                  style={styles.input}
                  value={deliveryLocation}
                  onChangeText={(t) => { setError(null); setDeliveryLocation(t); }}
                  placeholder="City or town"
                  placeholderTextColor={design.ink3}
                />
              </Field>
            </View>
            <View style={styles.rowField}>
              <Field label="State">
                <TextInput
                  style={styles.input}
                  value={deliveryState}
                  onChangeText={(t) => { setError(null); setDeliveryState(t); }}
                  placeholder="Maharashtra"
                  placeholderTextColor={design.ink3}
                />
              </Field>
            </View>
          </View>

          <Field label="Needed by (optional)">
            <TextInput
              style={styles.input}
              value={neededBy}
              onChangeText={(t) => { setError(null); setNeededBy(t); }}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={design.ink3}
              autoCapitalize="none"
            />
          </Field>
        </View>

        <View style={styles.card}>
          <Mono style={styles.eyebrow}>ANYTHING ELSE</Mono>

          <Field label="Notes for farmers (optional)">
            <TextInput
              style={[styles.input, styles.multiline]}
              value={description}
              onChangeText={setDescription}
              multiline
              placeholder="Packing, moisture limits, how often you will need this…"
              placeholderTextColor={design.ink3}
            />
          </Field>

          <Field label="Payment terms (optional)">
            <TextInput
              style={styles.input}
              value={paymentTerms}
              onChangeText={setPaymentTerms}
              placeholder="Escrow released on delivery"
              placeholderTextColor={design.ink3}
            />
          </Field>

          <Field label="Delivery terms (optional)">
            <TextInput
              style={styles.input}
              value={deliveryTerms}
              onChangeText={setDeliveryTerms}
              placeholder="Farm gate pickup, or delivered to the warehouse"
              placeholderTextColor={design.ink3}
            />
          </Field>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Button label="Post requirement" onPress={onSubmit} loading={submitting} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: design.bg },
  body: { padding: 14, gap: 12, paddingBottom: 40 },
  card: {
    backgroundColor: design.paper,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: design.line,
    padding: 16,
  },
  eyebrow: { fontSize: 10, letterSpacing: 0.7, color: design.ink3, marginBottom: 6 },
  field: { marginTop: 10 },
  label: { fontFamily: font.sansSemi, fontSize: 12.5, color: design.ink2, marginBottom: 5 },
  input: {
    borderWidth: 1,
    borderColor: design.line,
    borderRadius: 11,
    paddingHorizontal: 13,
    paddingVertical: 12,
    fontFamily: font.sans,
    fontSize: 15,
    color: design.ink,
    backgroundColor: design.bg,
  },
  multiline: { minHeight: 76, textAlignVertical: 'top' },
  row: { flexDirection: 'row', gap: 10 },
  rowField: { flex: 1 },

  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  pill: {
    borderWidth: 1,
    borderColor: design.line,
    backgroundColor: design.bg,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  pillOn: { backgroundColor: colors.forest, borderColor: colors.forest },
  pillText: { fontFamily: font.sansMed, fontSize: 12.5, color: design.ink2 },
  pillTextOn: { color: colors.textInverse },

  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 16 },
  switchLabel: { fontFamily: font.sansSemi, fontSize: 13.5, color: design.ink },
  switchHint: { fontFamily: font.sans, fontSize: 11.5, color: design.ink3, marginTop: 2 },

  total: { fontFamily: font.sansBold, fontSize: 15, color: design.ink, marginTop: 16 },
  error: { fontFamily: font.sansMed, fontSize: 13, color: colors.error },
});
