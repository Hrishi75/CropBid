// =============================================================================
// CartScreen — the basket, priced live, grouped by when it arrives
// =============================================================================
// GROUPED BY LANE, NOT BY SHOP. A basket spanning Quick and Fresh turns up in
// two deliveries on two different days, and a shopper who is not told that
// before paying finds out when half the order does not arrive. Grouping by shop
// would be tidier and would hide exactly the thing they need to know.
//
// Every price here comes from lib/cartLines, which re-fetches each lot. The
// snapshot in the basket is for first paint only and is never billed off.
// =============================================================================

import { useMemo, useState } from 'react';
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import { useBill, type CartLine } from '../lib/cartLines';
import { directPurchase } from '../api/endpoints';
import { errorMessage } from '../api/client';
import { LANES, laneFor, type DeliveryLane } from '../lib/delivery';
import { FreshWindow } from '../components/FreshWindow';
import { QuantityStepper } from '../components/QuantityStepper';
import { formatWeight, fromKg, money } from '../lib/units';
import { listingImage } from '../lib/cropImages';
import { Empty, Mono, SectionLabel } from '../components/ui';
import { IconBasket } from '../components/icons';
import { colors, design, font, radius, shadow, spacing } from '../theme';

/**
 * Orders is not a sibling route any more, it lives inside the You tab, so
 * getting there is a tab jump plus a screen inside it. Calling
 * navigate('Orders') from here silently does nothing.
 */
type CartNav = {
  navigate: {
    (screen: 'Home'): void;
    (screen: 'You', params: { screen: 'Orders' }): void;
  };
};

export default function CartScreen({ navigation }: { navigation: CartNav }) {
  const insets = useSafeAreaInsets();
  const { items, setQuantity, remove, removeMany } = useCart();
  const { user, signedIn } = useAuth();
  const bill = useBill(items);

  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [placing, setPlacing] = useState(false);
  const [touched, setTouched] = useState(false);

  const byLane = useMemo(() => {
    const groups: Record<DeliveryLane, CartLine[]> = { QUICK: [], FRESH: [] };
    for (const line of bill.lines) groups[laneFor(line.item.sellerType)].push(line);
    return groups;
  }, [bill.lines]);

  const addressValid = address.trim().length >= 10;
  const phoneValid = phone.replace(/[^0-9]/g, '').length >= 10;
  const canPlace = signedIn && addressValid && phoneValid && bill.orderable.length > 0 && !placing;

  async function place() {
    setTouched(true);
    if (!canPlace) return;
    setPlacing(true);

    const placed: string[] = [];
    const failures: string[] = [];

    // Sequential, not Promise.all: each call decrements stock, and a shop
    // watching their listings should see orders arrive as orders rather than as
    // a burst of parallel writes racing each other's stock claims.
    for (const line of bill.orderable) {
      try {
        await directPurchase({
          listingId: line.item.listingId,
          // THE ONE PLACE kilograms turn back into the lot's own unit.
          //
          // line.unit, not line.item.unit: the second is the snapshot taken when
          // the row went into the basket, and a seller can re-denominate an
          // active listing while it sits there. Converting with the stale one
          // sends a number the server reads in a different unit, so a 1 kg order
          // arrives as 1 quintal and is charged and decremented as such.
          quantity: fromKg(line.quantity, line.unit),
          // The unit that conversion used, so the server can refuse a mismatch
          // rather than silently rescaling the order by a hundred.
          unit: line.unit,
          deliveryAddress: address.trim(),
          contactPhone: phone.trim(),
          // Minted with the line and re-minted whenever its amount moved, so
          // pressing Place order again after a failure replays THIS purchase
          // rather than making a second one.
          idempotencyKey: line.item.purchaseKey,
        });
        placed.push(line.item.listingId);
      } catch (e) {
        failures.push(`${line.item.cropName}: ${errorMessage(e, 'could not be ordered')}`);
      }
    }

    // Only what actually became an order leaves the basket.
    if (placed.length > 0) removeMany(placed);
    setPlacing(false);

    if (placed.length === 0) {
      Alert.alert('Could not place your order', failures[0] ?? 'Please try again.');
      return;
    }
    if (failures.length > 0) {
      Alert.alert(
        'Part of your order went through',
        `${placed.length} placed. Still in your basket:\n\n${failures.join('\n')}`,
      );
    }
    navigation.navigate('You', { screen: 'Orders' });
  }

  if (items.length === 0) {
    return (
      <View style={[styles.screen, styles.pad, { paddingTop: insets.top + spacing.xl }]}>
        <Text style={styles.title}>Basket</Text>
        <Empty
          icon={<IconBasket size={30} color={design.ink3} />}
          title="Your basket is empty"
          body="Pick a shop and add what you need. Quick arrives today, Fresh tomorrow morning."
        />
        <Pressable
          onPress={() => navigation.navigate('Home')}
          style={({ pressed }) => [styles.browseBtn, pressed && { opacity: 0.85 }]}
        >
          <Text style={styles.browseBtnText}>Browse shops</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={[styles.pad, { paddingTop: insets.top + spacing.xl, paddingBottom: 220 }]}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>Basket</Text>

        {(['QUICK', 'FRESH'] as DeliveryLane[]).map((lane) => {
          const lines = byLane[lane];
          if (lines.length === 0) return null;
          const meta = LANES[lane];
          return (
            <View key={lane} style={styles.group}>
              <View style={[styles.groupBar, { borderLeftColor: meta.color }]}>
                <Text style={styles.groupTitle}>{meta.title}</Text>
                <Mono style={styles.groupPromise}>{meta.promise}</Mono>
              </View>
              {/* Fresh has a deadline and Quick does not, so it is stated here
                  too: this is the last screen before the money moves. */}
              {lane === 'FRESH' ? <FreshWindow /> : null}

              {lines.map((line) => (
                <CartRow
                  key={line.item.listingId}
                  line={line}
                  onChange={(kg) => setQuantity(line.item.listingId, kg)}
                  onRemove={() => remove(line.item.listingId)}
                />
              ))}
            </View>
          );
        })}

        <SectionLabel>DELIVERY</SectionLabel>
        <TextInput
          value={address}
          onChangeText={setAddress}
          placeholder="Flat, building, street, area"
          placeholderTextColor={design.ink3}
          multiline
          style={[styles.input, styles.inputArea, touched && !addressValid && styles.inputBad]}
        />
        {touched && !addressValid ? (
          <Text style={styles.err}>Please give a full address we can find.</Text>
        ) : null}

        <TextInput
          value={phone}
          onChangeText={setPhone}
          placeholder="Phone for the delivery"
          placeholderTextColor={design.ink3}
          keyboardType="phone-pad"
          style={[styles.input, touched && !phoneValid && styles.inputBad]}
        />
        {touched && !phoneValid ? <Text style={styles.err}>Enter a 10-digit number.</Text> : null}
      </ScrollView>

      {/* The bill sits above the fold, always. A total a shopper has to scroll
          to find is a total they meet for the first time after paying. */}
      <View style={[styles.billBar, { paddingBottom: insets.bottom + spacing.md }]}>
        <View style={styles.billRow}>
          <View>
            <Mono style={styles.billLabel}>
              {bill.orderable.length} {bill.orderable.length === 1 ? 'ITEM' : 'ITEMS'}
              {bill.lines.length !== bill.orderable.length
                ? ` · ${bill.lines.length - bill.orderable.length} unavailable`
                : ''}
            </Mono>
            <Text style={styles.billTotal}>
              {bill.loading ? 'Checking prices' : money(bill.subtotal, bill.currency)}
            </Text>
          </View>
          <Pressable
            onPress={place}
            disabled={!canPlace}
            style={({ pressed }) => [
              styles.placeBtn,
              !canPlace && styles.placeBtnOff,
              pressed && { opacity: 0.8 },
            ]}
          >
            <Text style={styles.placeBtnText}>
              {placing ? 'Placing…' : signedIn ? 'Place order' : 'Sign in to order'}
            </Text>
          </Pressable>
        </View>
        {/* Said plainly, because §6 of the root CLAUDE.md is emphatic that no
            copy may promise an automatic payout. This promises nothing. */}
        <Mono style={styles.billNote}>Money is held until you confirm delivery</Mono>
      </View>
    </View>
  );
}

function CartRow({
  line,
  onChange,
  onRemove,
}: {
  line: CartLine;
  onChange: (kg: number) => void;
  onRemove: () => void;
}) {
  const photo = line.listing ? listingImage(line.listing) : line.item.image;
  const maxKg = line.listing ? line.listing.remainingQuantity * (line.unit === 'KG' ? 1 : line.unit === 'QUINTAL' ? 100 : 1000) : line.quantity;

  return (
    <View style={[styles.row, line.problem ? styles.rowDim : null]}>
      {photo ? (
        <Image source={{ uri: photo }} style={styles.rowThumb} />
      ) : (
        <View style={[styles.rowThumb, styles.rowThumbFallback]}>
          <Text style={styles.rowThumbLetter}>{line.item.cropName.charAt(0).toUpperCase()}</Text>
        </View>
      )}

      <View style={styles.rowBody}>
        <Text style={styles.rowName} numberOfLines={1}>{line.item.cropName}</Text>
        <Mono style={styles.rowShop} numberOfLines={1}>{line.item.shopName ?? 'Shop'}</Mono>
        {line.problem ? (
          <Text style={styles.rowProblem}>{line.problem}</Text>
        ) : (
          <Mono style={styles.rowUnit}>
            {money(line.perKg, line.item.currency)}/kg · {formatWeight(line.quantity)}
          </Mono>
        )}
      </View>

      <View style={styles.rowRight}>
        {line.problem ? (
          <Pressable onPress={onRemove} hitSlop={8}>
            <Mono style={styles.removeText}>REMOVE</Mono>
          </Pressable>
        ) : (
          <>
            <Text style={styles.rowTotal}>{money(line.total, line.item.currency)}</Text>
            <View style={{ marginTop: 6 }}>
              <QuantityStepper kg={line.quantity} maxKg={maxKg} onChange={onChange} onRemove={onRemove} />
            </View>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: design.bg },
  pad: { paddingHorizontal: spacing.lg },
  title: { fontFamily: font.sansBold, fontSize: 28, color: design.ink, marginBottom: spacing.lg },

  group: { marginBottom: spacing.xl },
  groupBar: { borderLeftWidth: 3, paddingLeft: spacing.md, marginBottom: spacing.md },
  groupTitle: { fontFamily: font.sansSemi, fontSize: 16, color: design.ink },
  groupPromise: { fontSize: 11, color: design.ink3, marginTop: 1 },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: design.paper,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    ...shadow.card,
  },
  rowDim: { opacity: 0.6 },
  rowThumb: { width: 52, height: 52, borderRadius: radius.md, backgroundColor: design.paper2 },
  rowThumbFallback: { alignItems: 'center', justifyContent: 'center', backgroundColor: design.mint },
  rowThumbLetter: { fontFamily: font.sansBold, fontSize: 20, color: colors.sage },
  rowBody: { flex: 1 },
  rowName: { fontFamily: font.sansSemi, fontSize: 14, color: design.ink },
  rowShop: { fontSize: 10, color: design.ink3, marginTop: 1 },
  rowUnit: { fontSize: 11, color: design.ink2, marginTop: 3 },
  rowProblem: { fontFamily: font.sansMed, fontSize: 11, color: colors.ember, marginTop: 3 },
  rowRight: { alignItems: 'flex-end' },
  rowTotal: { fontFamily: font.monoSemi, fontSize: 15, color: design.ink },
  removeText: { fontSize: 10, letterSpacing: 0.5, color: colors.ember },

  input: {
    backgroundColor: design.paper,
    borderWidth: 1,
    borderColor: design.line,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontFamily: font.sans,
    fontSize: 14,
    color: design.ink,
    marginTop: spacing.sm,
    outlineStyle: 'none',
  } as object,
  inputArea: { minHeight: 68, textAlignVertical: 'top' },
  inputBad: { borderColor: colors.ember },
  err: { fontFamily: font.sans, fontSize: 11, color: colors.ember, marginTop: 4 },

  billBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: design.paper,
    borderTopWidth: 1,
    borderTopColor: design.line,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    ...shadow.header,
  },
  billRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  billLabel: { fontSize: 9, letterSpacing: 0.5, color: design.ink3 },
  billTotal: { fontFamily: font.sansBold, fontSize: 22, color: design.ink, marginTop: 1 },
  placeBtn: {
    backgroundColor: colors.forest,
    borderRadius: radius.md,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  placeBtnOff: { opacity: 0.4 },
  placeBtnText: { fontFamily: font.sansSemi, fontSize: 15, color: colors.surface },
  billNote: { fontSize: 9, letterSpacing: 0.4, color: design.ink3, marginTop: spacing.sm },
  browseBtn: {
    alignSelf: 'flex-start',
    backgroundColor: colors.forest,
    borderRadius: radius.md,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  browseBtnText: { fontFamily: font.sansSemi, fontSize: 15, color: colors.surface },
});
