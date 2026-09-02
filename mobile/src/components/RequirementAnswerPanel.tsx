// =============================================================================
// RequirementAnswerPanel — how a farmer answers a piece of demand
// =============================================================================
// Two ways to answer, one form:
//   FILL    → POST /requirements/:id/accept. Closes the deal on the spot at the
//             buyer's posted price; the price field is shown but locked,
//             because changing it would make this the other action.
//   COUNTER → POST /requirements/:id/offers. Proposes the farmer's own price
//             and waits on the buyer.
//
// It opens on the whole outstanding amount at the buyer's own price — the
// common case — with the quantity left editable, because requirements support
// partial fills.
//
// Shared by the board (inline on a card) and the requirement detail screen, so
// the two can never drift into offering different terms for the same action.
// =============================================================================

import React, { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { PressScale } from './motion';
import { Mono } from './buyerKit';
import { fillRequirement, offerOnRequirement } from '../api/endpoints';
import { errorMessage } from '../api/client';
import { money, unitLabel } from '../lib/format';
import type { BuyerRequirement } from '../api/types';
import { colors, design, font } from '../theme';

export function RequirementAnswerPanel({
  requirement: r, mode, onClose, onDone,
}: {
  requirement: BuyerRequirement;
  mode: 'fill' | 'counter';
  onClose: () => void;
  onDone: () => void;
}) {
  const [qty, setQty] = useState(String(r.remainingQuantity));
  const [price, setPrice] = useState(String(r.pricePerUnit));
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const unit = unitLabel(r.unit);
  const quantity = Number(qty);
  const perUnit = mode === 'fill' ? r.pricePerUnit : Number(price);
  const total = quantity > 0 && perUnit > 0 ? quantity * perUnit : 0;

  async function submit() {
    if (!(quantity > 0)) { setError('Enter a valid quantity'); return; }
    if (quantity > r.remainingQuantity) {
      setError(`Only ${r.remainingQuantity.toLocaleString('en-IN')} ${unit} still needed`);
      return;
    }
    if (mode === 'counter' && !(perUnit > 0)) { setError('Enter a valid price'); return; }

    setError(null);
    setSubmitting(true);
    try {
      if (mode === 'fill') {
        await fillRequirement(r.id, { quantity, message: message.trim() || undefined });
        Alert.alert('Filled', 'The deal is done — it is in your sales now.', [{ text: 'OK', onPress: onDone }]);
      } else {
        await offerOnRequirement(r.id, { quantity, pricePerUnit: perUnit, message: message.trim() || undefined });
        Alert.alert('Offer sent', 'The buyer will review it and reply.', [{ text: 'OK', onPress: onDone }]);
      }
      onClose();
    } catch (e) {
      // Carries the server's real message, so a 409 ("another farmer just
      // filled it") explains itself rather than reading as a generic failure.
      setError(errorMessage(e, 'Could not send that'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.panel}>
        <Mono style={styles.panelHead}>
          {mode === 'fill' ? "FILL AT THE BUYER'S PRICE" : 'COUNTER WITH YOUR OWN PRICE'}
        </Mono>

        <View style={styles.panelRow}>
          <View style={styles.panelField}>
            <Text style={styles.panelLabel}>Quantity ({unit})</Text>
            <TextInput
              style={styles.panelInput}
              value={qty}
              onChangeText={(t) => { setError(null); setQty(t); }}
              keyboardType="numeric"
              placeholderTextColor={design.ink3}
            />
          </View>
          <View style={styles.panelField}>
            <Text style={styles.panelLabel}>Price per {unit}</Text>
            <TextInput
              style={[styles.panelInput, mode === 'fill' && styles.panelInputLocked]}
              value={mode === 'fill' ? String(r.pricePerUnit) : price}
              onChangeText={(t) => { setError(null); setPrice(t); }}
              keyboardType="numeric"
              editable={mode === 'counter'}
              placeholderTextColor={design.ink3}
            />
          </View>
        </View>

        <Text style={styles.panelLabel}>Message (optional)</Text>
        <TextInput
          style={[styles.panelInput, styles.panelMultiline]}
          value={message}
          onChangeText={setMessage}
          multiline
          placeholder="Anything the buyer should know"
          placeholderTextColor={design.ink3}
        />

        <Text style={styles.panelTotal}>Total {money(total, r.currency)}</Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}

        <View style={styles.panelBtns}>
          <Pressable onPress={onClose} style={[styles.actionBtn, styles.panelBtn]}>
            <Text style={styles.actionText}>Cancel</Text>
          </Pressable>
          <PressScale
            onPress={submitting ? undefined : submit}
            cardStyle={[styles.actionBtn, styles.actionPrimary, styles.panelBtn, submitting && styles.dim]}
          >
            <Text style={[styles.actionText, styles.actionTextPrimary]}>
              {submitting ? 'Sending…' : mode === 'fill' ? 'Fill it' : 'Send offer'}
            </Text>
          </PressScale>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  panel: { backgroundColor: design.paper2, borderRadius: 12, padding: 13, gap: 4, marginTop: 2 },
  panelHead: { fontSize: 9.5, letterSpacing: 0.7, color: design.ink3, marginBottom: 6 },
  panelRow: { flexDirection: 'row', gap: 10 },
  panelField: { flex: 1 },
  panelLabel: { fontFamily: font.sansSemi, fontSize: 11.5, color: design.ink2, marginTop: 6, marginBottom: 4 },
  panelInput: {
    borderWidth: 1,
    borderColor: design.line,
    borderRadius: 9,
    paddingHorizontal: 11,
    paddingVertical: 9,
    fontFamily: font.sans,
    fontSize: 14.5,
    color: design.ink,
    backgroundColor: design.paper,
  },
  panelInputLocked: { color: design.ink3 },
  panelMultiline: { minHeight: 58, textAlignVertical: 'top' },
  panelTotal: { fontFamily: font.sansBold, fontSize: 15, color: design.ink, marginTop: 10 },
  panelBtns: { flexDirection: 'row', gap: 9, marginTop: 10 },
  panelBtn: { paddingVertical: 12 },
  error: { fontFamily: font.sansMed, fontSize: 12.5, color: colors.error, marginTop: 6 },
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
  actionText: { fontFamily: font.sansBold, fontSize: 13, color: colors.forest },
  actionTextPrimary: { color: colors.textInverse },
  dim: { opacity: 0.55 },
});
