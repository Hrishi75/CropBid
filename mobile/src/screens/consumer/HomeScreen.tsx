// Consumer app · Home — quick-commerce storefront for crops farmers have opened
// up for direct retail sale (directSaleEnabled). Borrows the grocery-app layout
// grammar (masthead with search, photo offers rail, category chips, dense
// 2-column grid with ADD buttons overlapping the photo, "Only X left" urgency)
// but keeps CropBid's own paper-and-forest palette. No bidding here: ADD opens
// ListingDetail where the consumer picks a quantity and buys at the listed price.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { IconSearch } from '../../components/icons';
import { Mono } from '../../components/buyerKit';
import { colors, design, font } from '../../theme';
import { browse } from '../../api/endpoints';
import { errorMessage, mediaUrl } from '../../api/client';
import type { Listing } from '../../api/types';
import { money, unitLabel } from '../../lib/format';

// Discount vs the listing's wholesale ceiling — the anchor price a consumer
// would compare against. Only meaningful when the farmer set a retail price
// below it; tiny gaps aren't worth a badge.
function pctOff(l: Listing): number {
  if (l.retailPricePerUnit == null || l.retailPricePerUnit >= l.pricePerUnitMax) return 0;
  return Math.round((1 - l.retailPricePerUnit / l.pricePerUnitMax) * 100);
}

// Low-stock urgency, shown in ember like a grocery app's "Only 3 left".
function isLowStock(l: Listing): boolean {
  return l.quantity > 0 && l.remainingQuantity / l.quantity <= 0.25;
}

export default function ConsumerHomeScreen() {
  const insets = useSafeAreaInsets();
  const nav = useNavigation<any>();
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await browse({ directSale: true });
      setListings(data.listings ?? []);
      setError(null);
    } catch (e) {
      setError(errorMessage(e, 'Could not load crops'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  // Offers rail: best discounts first; when nobody is discounting, show the
  // newest arrivals so the rail never sits empty.
  const offers = useMemo(
    () => listings.filter((l) => pctOff(l) >= 5).sort((a, b) => pctOff(b) - pctOff(a)).slice(0, 10),
    [listings],
  );
  const rail = offers.length > 0 ? offers : listings.slice(0, 6);
  const railTitle = offers.length > 0 ? 'Offers for you' : 'Fresh today';

  // Category chips: one per crop, with a photo when any listing has one.
  const categories = useMemo(() => {
    const seen = new Map<string, string | null>();
    for (const l of listings) {
      const img = seen.get(l.cropName);
      if (img === undefined || (img === null && l.images?.[0])) seen.set(l.cropName, l.images?.[0] ?? null);
    }
    return [...seen.entries()].map(([name, image]) => ({ name, image }));
  }, [listings]);

  const q = search.trim().toLowerCase();
  const shown = listings.filter((l) => {
    if (category && l.cropName !== category) return false;
    if (!q) return true;
    return `${l.cropName} ${l.cropVariety ?? ''} ${l.location} ${l.state}`.toLowerCase().includes(q);
  });

  const openListing = (l: Listing) => nav.navigate('ListingDetail', { id: l.id, preview: l });

  return (
    <View style={styles.flex}>
      <FlatList
        data={shown}
        keyExtractor={(l) => l.id}
        numColumns={2}
        columnWrapperStyle={styles.gridRow}
        contentContainerStyle={{ paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.forest} />}
        ListHeaderComponent={
          <View>
            {/* masthead */}
            <View style={[styles.mast, { paddingTop: insets.top + 10 }]}>
              <Mono style={styles.mastMini}>CROPBID MARKET</Mono>
              <Text style={styles.mastBig}>Farm to home</Text>
              <Text style={styles.mastSub}>
                {listings.length} {listings.length === 1 ? 'crop' : 'crops'} · straight from the farmer
              </Text>
              <View style={styles.searchBar}>
                <IconSearch size={17} stroke={design.ink3} />
                <TextInput
                  style={styles.searchInput}
                  value={search}
                  onChangeText={setSearch}
                  placeholder={'Search "tomato"'}
                  placeholderTextColor={design.ink3}
                  autoCapitalize="none"
                  returnKeyType="search"
                />
              </View>
            </View>

            {/* offers rail */}
            {rail.length > 0 ? (
              <>
                <Text style={styles.sectionTitle}>{railTitle}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.railPad}>
                  {rail.map((l) => (
                    <OfferCard key={l.id} listing={l} onPress={() => openListing(l)} />
                  ))}
                </ScrollView>
              </>
            ) : null}

            {/* category chips */}
            {categories.length > 1 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsPad}>
                <Chip label="All" selected={category === null} onPress={() => setCategory(null)} />
                {categories.map((c) => (
                  <Chip
                    key={c.name}
                    label={c.name}
                    image={c.image}
                    selected={category === c.name}
                    onPress={() => setCategory(category === c.name ? null : c.name)}
                  />
                ))}
              </ScrollView>
            ) : null}

            {shown.length > 0 ? <Text style={styles.sectionTitle}>All crops</Text> : null}
          </View>
        }
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator color={colors.forest} style={{ marginTop: 40 }} />
          ) : (
            <Text style={styles.emptyText}>
              {error ?? (q || category
                ? 'Nothing matches — try another crop.'
                : 'No farmers are selling directly right now — check back soon.')}
            </Text>
          )
        }
        renderItem={({ item }) => <ProductCard listing={item} onPress={() => openListing(item)} />}
      />
    </View>
  );
}

function CropPhoto({ listing, style }: { listing: Listing; style: object }) {
  const img = mediaUrl(listing.images?.[0]);
  if (img) return <Image source={{ uri: img }} style={style} />;
  return (
    <View style={[style, styles.photoEmpty]}>
      <Text style={styles.photoLetter}>{listing.cropName[0]}</Text>
    </View>
  );
}

function OfferCard({ listing, onPress }: { listing: Listing; onPress: () => void }) {
  const pct = pctOff(listing);
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.offerCard, pressed && { opacity: 0.9 }]}>
      <View>
        <CropPhoto listing={listing} style={styles.offerPhoto} />
        {pct > 0 ? (
          <View style={styles.offTag}>
            <Text style={styles.offTagText}>{pct}% OFF</Text>
          </View>
        ) : null}
      </View>
      <Text style={styles.offerName} numberOfLines={1}>
        {listing.cropName}
        {listing.cropVariety ? ` · ${listing.cropVariety}` : ''}
      </Text>
      <View style={styles.priceRow}>
        <Text style={styles.price}>{money(listing.retailPricePerUnit ?? 0, listing.currency)}</Text>
        {pct > 0 ? <Text style={styles.strike}>{money(listing.pricePerUnitMax, listing.currency)}</Text> : null}
        <Text style={styles.perUnit}>/{unitLabel(listing.unit)}</Text>
      </View>
    </Pressable>
  );
}

function Chip({ label, image, selected, onPress }: { label: string; image?: string | null; selected: boolean; onPress: () => void }) {
  const img = image ? mediaUrl(image) : null;
  return (
    <Pressable onPress={onPress} style={[styles.chip, selected && styles.chipOn]}>
      {img ? <Image source={{ uri: img }} style={styles.chipPhoto} /> : null}
      <Text style={[styles.chipText, selected && styles.chipTextOn]}>{label}</Text>
    </Pressable>
  );
}

function ProductCard({ listing, onPress }: { listing: Listing; onPress: () => void }) {
  const pct = pctOff(listing);
  const low = isLowStock(listing);
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.card, pressed && { opacity: 0.92 }]}>
      <View>
        <CropPhoto listing={listing} style={styles.cardPhoto} />
        {pct > 0 ? (
          <View style={styles.offTag}>
            <Text style={styles.offTagText}>{pct}% OFF</Text>
          </View>
        ) : null}
        <View style={styles.addBtn}>
          <Text style={styles.addBtnText}>ADD</Text>
        </View>
      </View>
      <View style={styles.pillRow}>
        <View style={styles.pill}>
          <Mono style={styles.pillText}>GRADE {listing.qualityGrade}</Mono>
        </View>
        {listing.organic ? (
          <View style={styles.pill}>
            <Mono style={styles.pillText}>ORGANIC</Mono>
          </View>
        ) : null}
      </View>
      <Text style={styles.cardName} numberOfLines={1}>
        {listing.cropName}
        {listing.cropVariety ? ` · ${listing.cropVariety}` : ''}
      </Text>
      <Text style={styles.cardMeta} numberOfLines={1}>
        {listing.location}, {listing.state}
      </Text>
      <Text style={[styles.stock, low && styles.stockLow]} numberOfLines={1}>
        {low
          ? `Only ${listing.remainingQuantity.toLocaleString('en-IN')} ${unitLabel(listing.unit)} left`
          : `${listing.remainingQuantity.toLocaleString('en-IN')} ${unitLabel(listing.unit)} in stock`}
      </Text>
      <View style={styles.priceRow}>
        <Text style={styles.price}>{money(listing.retailPricePerUnit ?? 0, listing.currency)}</Text>
        {pct > 0 ? <Text style={styles.strike}>{money(listing.pricePerUnitMax, listing.currency)}</Text> : null}
        <Text style={styles.perUnit}>/{unitLabel(listing.unit)}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: design.bg },

  // masthead — deep forest brand block with a paper search bar
  mast: {
    backgroundColor: colors.forest,
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderBottomLeftRadius: 22,
    borderBottomRightRadius: 22,
  },
  mastMini: { fontSize: 10.5, letterSpacing: 1.2, color: design.leaf },
  mastBig: { fontFamily: font.sansBold, fontSize: 27, letterSpacing: -0.5, color: colors.textInverse, marginTop: 2 },
  mastSub: { fontFamily: font.sansMed, fontSize: 12.5, color: 'rgba(244,241,234,0.72)', marginTop: 2 },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: design.paper,
    borderRadius: 12,
    paddingHorizontal: 12,
    marginTop: 12,
  },
  searchInput: { flex: 1, paddingVertical: 10, fontFamily: font.sans, fontSize: 14.5, color: design.ink },

  sectionTitle: {
    fontFamily: font.sansSemi,
    fontSize: 17,
    letterSpacing: -0.3,
    color: design.ink,
    paddingHorizontal: 16,
    marginTop: 18,
    marginBottom: 10,
  },

  // offers rail
  railPad: { paddingHorizontal: 16, gap: 10 },
  offerCard: {
    width: 148,
    backgroundColor: design.paper,
    borderWidth: 1,
    borderColor: design.line,
    borderRadius: 14,
    padding: 8,
  },
  offerPhoto: { width: '100%', height: 92, borderRadius: 10, backgroundColor: design.paper2 },
  offerName: { fontFamily: font.sansSemi, fontSize: 13, color: design.ink, marginTop: 8 },

  // shared photo fallback + offer tag
  photoEmpty: { backgroundColor: design.mint, alignItems: 'center', justifyContent: 'center' },
  photoLetter: { fontFamily: font.sansBold, fontSize: 26, color: colors.forest },
  offTag: {
    position: 'absolute',
    top: 6,
    left: 6,
    backgroundColor: colors.ember,
    borderRadius: 5,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  offTagText: { fontFamily: font.sansBold, fontSize: 9.5, color: '#fff', letterSpacing: 0.2 },

  // chips
  chipsPad: { paddingHorizontal: 16, gap: 8, marginTop: 16 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: design.line,
    backgroundColor: design.paper,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  chipOn: { backgroundColor: design.mint, borderColor: colors.forest },
  chipPhoto: { width: 18, height: 18, borderRadius: 9 },
  chipText: { fontFamily: font.sansMed, fontSize: 12.5, color: design.ink2 },
  chipTextOn: { fontFamily: font.sansSemi, color: colors.forest },

  // product grid
  gridRow: { paddingHorizontal: 16, gap: 10 },
  card: {
    flex: 1,
    // A lone card in the last FlatList row would otherwise stretch full-width.
    maxWidth: '48.5%',
    backgroundColor: design.paper,
    borderWidth: 1,
    borderColor: design.line,
    borderRadius: 14,
    padding: 9,
    marginBottom: 10,
  },
  cardPhoto: { width: '100%', height: 104, borderRadius: 10, backgroundColor: design.paper2 },
  // ADD overlaps the photo's bottom-right corner, grocery-app style.
  addBtn: {
    position: 'absolute',
    right: 5,
    bottom: -10,
    backgroundColor: design.paper,
    borderWidth: 1.3,
    borderColor: colors.forest,
    borderRadius: 9,
    paddingHorizontal: 13,
    paddingVertical: 5,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  addBtnText: { fontFamily: font.sansBold, fontSize: 12, color: colors.forest, letterSpacing: 0.4 },
  pillRow: { flexDirection: 'row', gap: 4, marginTop: 14 },
  pill: { backgroundColor: design.paper2, borderRadius: 5, paddingHorizontal: 5, paddingVertical: 2 },
  pillText: { fontSize: 8.5, letterSpacing: 0.4, color: design.ink2 },
  cardName: { fontFamily: font.sansSemi, fontSize: 13.5, color: design.ink, marginTop: 5 },
  cardMeta: { fontFamily: font.sans, fontSize: 11, color: design.ink3, marginTop: 2 },
  stock: { fontFamily: font.sansMed, fontSize: 10.5, color: design.ink3, marginTop: 4 },
  stockLow: { color: colors.ember },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 5, marginTop: 5 },
  price: { fontFamily: font.sansBold, fontSize: 14, color: design.ink },
  perUnit: { fontFamily: font.sans, fontSize: 10.5, color: design.ink3 },
  strike: { fontFamily: font.sans, fontSize: 11, color: design.ink3, textDecorationLine: 'line-through' },

  emptyText: {
    fontFamily: font.sans,
    fontSize: 13.5,
    color: design.ink3,
    textAlign: 'center',
    marginTop: 40,
    paddingHorizontal: 24,
  },
});
