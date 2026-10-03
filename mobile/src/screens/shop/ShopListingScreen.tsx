// =============================================================================
// ShopListingScreen — a local shop putting an item on its shelf
// =============================================================================
// The farm form (farmer/CreateListingScreen) asks for a lowest and a hoped
// price, quintals or tonnes, a harvest date, where the crop is, and whether to
// "also" sell to consumers. A kirana counter has one price, sells by the kilo,
// sells only to households, and is where it is. So this form asks for the
// item, its price per kg, how much is in stock, and a photo, and nothing else.
//
// THE ONE PRICE IS SENT AS ALL THREE. The listing model is shared with the
// trade side and the server requires a floor and a ceiling, and that a retail
// price is not below the floor. The shelf price is sent as floor, ceiling and
// retail together, which is exactly what a fixed-price item is.
//
// THE PLACE IS THE SHOP'S. A lot's city decides which households can see it
// (CLAUDE.md §3), so it is taken from the account rather than typed per item,
// where a typo would hide it from every shopper. If the city is not one
// CropBid delivers to, the form says so before anything is saved.
// =============================================================================

import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator, Image, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView,
  SectionList, StyleSheet, Switch, Text, TextInput, View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { Alert } from '../../lib/alert';
import { Mono } from '../../components/buyerKit';
import { IconArrowLeft, IconCheck, IconChevR, IconPin, IconPlus } from '../../components/icons';
import { useAuth } from '../../context/AuthContext';
import { createListing, fetchListing, retailCities, updateListing } from '../../api/endpoints';
import { errorMessage, mediaUrl } from '../../api/client';
import type { FarmerStackParamList } from '../../navigation/types';
import { money } from '../../lib/format';
import { CROP_CATEGORIES } from '../../lib/crops';
import { cropEmojiFor } from '../../utils/cropImages';
import { colors, design, font } from '../../theme';

const GRADES = [
  { v: 'A', label: 'Premium' },
  { v: 'B', label: 'Standard' },
  { v: 'C', label: 'Economy' },
];

type Props = NativeStackScreenProps<FarmerStackParamList, 'CreateListing'>;

export default function ShopListingScreen({ route, navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const editId = route.params?.id;
  const isEdit = Boolean(editId);

  const [item, setItem] = useState('');
  const [variety, setVariety] = useState('');
  const [price, setPrice] = useState('');
  const [stock, setStock] = useState('');
  const [grade, setGrade] = useState('A');
  const [organic, setOrganic] = useState(false);
  const [photos, setPhotos] = useState<ImagePicker.ImagePickerAsset[]>([]);
  const [existing, setExisting] = useState<string[]>([]);
  const [city, setCity] = useState(user?.location?.trim() ?? '');
  const [stateName, setStateName] = useState(user?.farmerProfile?.state ?? '');
  const [served, setServed] = useState<string[] | null>(null);
  const [fetching, setFetching] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [picking, setPicking] = useState(false);

  const currency = user?.currency || 'INR';

  useEffect(() => {
    retailCities()
      .then((rows) => setServed(rows.map((r) => r.city.toLowerCase())))
      .catch(() => setServed(null));
  }, []);

  useEffect(() => {
    if (!editId) return;
    fetchListing(editId)
      .then((l) => {
        setItem(l.cropName || '');
        setVariety(l.cropVariety || '');
        setPrice(String(l.retailPricePerUnit ?? l.pricePerUnitMin ?? ''));
        setStock(String(l.quantity ?? ''));
        setGrade(l.qualityGrade || 'A');
        setOrganic(l.organic || false);
        setExisting(l.images ?? []);
        // An item already on the shelf keeps the place it was listed in.
        if (l.location) setCity(l.location);
        if (l.state) setStateName(l.state);
      })
      .catch((e) => {
        Alert.alert('Could not load this item', errorMessage(e));
        navigation.goBack();
      })
      .finally(() => setFetching(false));
  }, [editId]);

  async function addPhotos() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission needed', 'Allow photo access to add a picture of this item.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: Math.max(1, 5 - photos.length),
      quality: 0.8,
    });
    if (!result.canceled) setPhotos((prev) => [...prev, ...result.assets].slice(0, 5));
  }

  async function save() {
    const priceN = Number(price);
    const stockN = Number(stock);
    if (!item) return Alert.alert('Pick the item', 'Choose what you are putting on your shelf.');
    if (!(priceN > 0)) return Alert.alert('Price missing', 'Enter your price per kg.');
    if (!(stockN > 0)) return Alert.alert('Stock missing', 'Enter how many kg you have.');
    if (!city || !stateName) {
      return Alert.alert('Shop address missing', 'Add your town and state to your profile first.');
    }

    setSaving(true);
    try {
      const fields = {
        cropName: item,
        cropVariety: variety || undefined,
        quantity: stockN,
        unit: 'KG',
        qualityGrade: grade,
        pricePerUnitMin: priceN,
        pricePerUnitMax: priceN,
        currency,
        organic,
        location: city,
        country: user?.country || 'India',
        state: stateName,
        directSaleEnabled: true,
        retailPricePerUnit: priceN,
      };
      if (isEdit && editId) {
        await updateListing(editId, fields);
      } else {
        const form = new FormData();
        for (const [k, v] of Object.entries(fields)) {
          if (v !== undefined) form.append(k, String(v));
        }
        photos.forEach((a, i) => {
          form.append('images', {
            uri: a.uri,
            name: a.fileName ?? `photo-${i}.jpg`,
            type: a.mimeType ?? 'image/jpeg',
          } as unknown as Blob);
        });
        await createListing(form);
      }
      navigation.goBack();
    } catch (e) {
      Alert.alert(isEdit ? 'Could not save' : 'Could not add this item', errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  if (fetching) {
    return (
      <View style={[styles.flex, { justifyContent: 'center' }]}>
        <ActivityIndicator color={colors.forest} />
      </View>
    );
  }

  const priceN = Number(price) || 0;
  const delivers = served === null || served.includes(city.toLowerCase());

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 110 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.head}>
          <Pressable
            onPress={() => navigation.goBack()}
            hitSlop={8}
            accessibilityLabel="Back"
            style={({ pressed }) => [styles.back, pressed && { opacity: 0.8 }]}
          >
            <IconArrowLeft size={19} stroke={design.ink} />
          </Pressable>
          <Text style={styles.h1}>{isEdit ? 'Edit item' : 'Add to your shelf'}</Text>
          <Text style={styles.lede}>Households in your city see it and order by the kilo.</Text>
        </View>

        {/* ---- the item --------------------------------------------------- */}
        <View style={styles.card}>
          <Pressable
            onPress={() => setPicking(true)}
            style={({ pressed }) => [styles.itemRow, pressed && { opacity: 0.9 }]}
          >
            <View style={styles.itemTile}>
              <Text style={styles.itemEmoji}>{item ? cropEmojiFor(item) : '🛒'}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Mono style={styles.label}>ITEM</Mono>
              <Text style={[styles.itemName, !item && styles.placeholder]}>{item || 'Choose an item'}</Text>
            </View>
            <IconChevR size={13} stroke={design.ink3} />
          </Pressable>
          <TextInput
            style={styles.input}
            value={variety}
            onChangeText={setVariety}
            placeholder="Variety, optional (e.g. Desi, Hybrid)"
            placeholderTextColor={design.ink3}
          />
        </View>

        {/* ---- price and stock -------------------------------------------- */}
        <View style={styles.card}>
          <View style={styles.row2}>
            <View style={{ flex: 1 }}>
              <Mono style={styles.label}>PRICE PER KG</Mono>
              <View style={styles.moneyField}>
                <Text style={styles.prefix}>₹</Text>
                <TextInput
                  style={styles.moneyInput}
                  value={price}
                  onChangeText={setPrice}
                  keyboardType="numeric"
                  placeholder="24"
                  placeholderTextColor={design.ink3}
                />
              </View>
            </View>
            <View style={{ flex: 1 }}>
              <Mono style={styles.label}>IN STOCK</Mono>
              <View style={styles.moneyField}>
                <TextInput
                  style={styles.moneyInput}
                  value={stock}
                  onChangeText={setStock}
                  keyboardType="numeric"
                  placeholder="50"
                  placeholderTextColor={design.ink3}
                />
                <Text style={styles.suffix}>kg</Text>
              </View>
            </View>
          </View>
          {/* What the shopper will actually be charged, at the smallest size
              they can order (500 g) and the size the picker opens on (1 kg). */}
          {priceN > 0 ? (
            <Text style={styles.preview}>
              Shoppers pay {money(priceN / 2, currency)} for 500 g, {money(priceN, currency)} for 1 kg
            </Text>
          ) : null}

          <View>
            <Mono style={styles.label}>QUALITY</Mono>
            <View style={styles.segment}>
              {GRADES.map((g) => {
                const on = grade === g.v;
                return (
                  <Pressable key={g.v} onPress={() => setGrade(g.v)} style={[styles.seg, on && styles.segOn]}>
                    <Text style={[styles.segText, on && styles.segTextOn]}>{g.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>Organic</Text>
            <Switch
              value={organic}
              onValueChange={setOrganic}
              trackColor={{ true: colors.sage, false: design.line }}
              thumbColor="#fff"
            />
          </View>
        </View>

        {/* ---- photo ----------------------------------------------------- */}
        <View style={styles.card}>
          <Mono style={styles.label}>PHOTOS · OPTIONAL</Mono>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.photos}>
            {existing.map((src) => {
              const uri = mediaUrl(src);
              return uri ? <Image key={src} source={{ uri }} style={styles.photo} /> : null;
            })}
            {photos.map((a) => (
              <Pressable key={a.uri} onPress={() => setPhotos((p) => p.filter((x) => x.uri !== a.uri))}>
                <Image source={{ uri: a.uri }} style={styles.photo} />
                <View style={styles.photoX}><Text style={styles.photoXText}>×</Text></View>
              </Pressable>
            ))}
            {!isEdit && photos.length < 5 ? (
              <Pressable onPress={addPhotos} style={styles.addPhoto}>
                <IconPlus size={18} stroke={design.ink3} />
                <Text style={styles.addPhotoText}>Add</Text>
              </Pressable>
            ) : null}
          </ScrollView>
          {!isEdit && photos.length === 0 ? (
            <Text style={styles.hint}>Without one, shoppers see a standard picture of the item.</Text>
          ) : null}
        </View>

        {/* ---- where it sells from --------------------------------------- */}
        <View style={[styles.where, !delivers && styles.whereWarn]}>
          <IconPin size={15} stroke={delivers ? colors.forest : colors.ember} />
          <Text style={[styles.whereText, !delivers && styles.whereTextWarn]}>
            {city
              ? delivers
                ? `Sold from your shop in ${city}${stateName ? `, ${stateName}` : ''}`
                : `We don't deliver to homes in ${city} yet, so households won't see this item.`
              : 'Add your shop’s town to your profile before listing.'}
          </Text>
        </View>
      </ScrollView>

      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 12 }]}>
        <Pressable
          onPress={save}
          disabled={saving}
          style={({ pressed }) => [styles.submit, (pressed || saving) && { opacity: 0.85 }]}
        >
          {saving ? (
            <ActivityIndicator color="#f4f1ea" size="small" />
          ) : (
            <>
              <IconCheck size={16} stroke="#f4f1ea" />
              <Text style={styles.submitText}>{isEdit ? 'Save changes' : 'Put on my shelf'}</Text>
            </>
          )}
        </Pressable>
      </View>

      <Modal visible={picking} transparent animationType="slide" onRequestClose={() => setPicking(false)}>
        <Pressable style={styles.backdrop} onPress={() => setPicking(false)} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 8 }]}>
          <View style={styles.handle} />
          <Text style={styles.sheetTitle}>Choose an item</Text>
          <SectionList
            sections={CROP_CATEGORIES.map((c) => ({ title: `${c.icon}  ${c.name}`, data: c.crops }))}
            keyExtractor={(x) => x}
            style={{ maxHeight: 440 }}
            stickySectionHeadersEnabled={false}
            renderSectionHeader={({ section }) => <Text style={styles.sheetSection}>{section.title}</Text>}
            renderItem={({ item: c }) => (
              <Pressable
                style={styles.option}
                onPress={() => { setItem(c); setPicking(false); }}
              >
                <Text style={styles.optionEmoji}>{cropEmojiFor(c)}</Text>
                <Text style={[styles.optionText, c === item && styles.optionOn]}>{c}</Text>
                {c === item ? <IconCheck size={15} stroke={colors.forest} /> : null}
              </Pressable>
            )}
          />
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: design.bg },
  head: { paddingHorizontal: 20, paddingBottom: 8 },
  back: {
    width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center',
    backgroundColor: design.paper, borderWidth: 1, borderColor: design.line,
  },
  h1: { marginTop: 14, fontFamily: font.sansBold, fontSize: 26, letterSpacing: -0.6, color: design.ink },
  lede: { marginTop: 4, fontFamily: font.sans, fontSize: 14, lineHeight: 20, color: design.ink3 },

  card: {
    marginHorizontal: 16, marginTop: 12, padding: 16, gap: 14,
    backgroundColor: design.paper, borderWidth: 1, borderColor: design.line, borderRadius: 18,
  },
  label: { fontSize: 9.5, letterSpacing: 0.7, color: design.ink3, marginBottom: 6 },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  itemTile: {
    width: 52, height: 52, borderRadius: 15, alignItems: 'center', justifyContent: 'center',
    backgroundColor: design.mint,
  },
  itemEmoji: { fontSize: 26 },
  itemName: { fontFamily: font.sansBold, fontSize: 18, letterSpacing: -0.3, color: design.ink, marginTop: -2 },
  placeholder: { color: design.ink3, fontFamily: font.sansMed },
  input: {
    borderWidth: 1, borderColor: design.line, borderRadius: 12, backgroundColor: design.bg,
    paddingHorizontal: 14, paddingVertical: 12, fontFamily: font.sans, fontSize: 15, color: design.ink,
  },

  row2: { flexDirection: 'row', gap: 12 },
  moneyField: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1, borderColor: design.line, borderRadius: 12, backgroundColor: design.bg, paddingHorizontal: 14,
  },
  prefix: { fontFamily: font.sansSemi, fontSize: 18, color: design.ink3, marginRight: 4 },
  suffix: { fontFamily: font.sansMed, fontSize: 14, color: design.ink3, marginLeft: 4 },
  moneyInput: { flex: 1, paddingVertical: 12, fontFamily: font.sansBold, fontSize: 20, color: design.ink },
  preview: { fontFamily: font.sansMed, fontSize: 12.5, color: colors.forest, marginTop: -4 },

  segment: { flexDirection: 'row', backgroundColor: design.paper2, borderRadius: 12, padding: 3, gap: 3 },
  seg: { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: 10 },
  segOn: { backgroundColor: colors.forest },
  segText: { fontFamily: font.sansMed, fontSize: 13, color: design.ink2 },
  segTextOn: { color: colors.textInverse },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  switchLabel: { fontFamily: font.sansMed, fontSize: 14.5, color: design.ink },

  photos: { gap: 10 },
  photo: { width: 76, height: 76, borderRadius: 14, backgroundColor: design.paper2 },
  photoX: {
    position: 'absolute', top: -6, right: -6, width: 22, height: 22, borderRadius: 11,
    backgroundColor: colors.ember, alignItems: 'center', justifyContent: 'center',
  },
  photoXText: { color: '#fff', fontSize: 15, lineHeight: 18, fontWeight: '700' },
  addPhoto: {
    width: 76, height: 76, borderRadius: 14, borderWidth: 1, borderStyle: 'dashed', borderColor: design.line,
    alignItems: 'center', justifyContent: 'center', gap: 2, backgroundColor: design.bg,
  },
  addPhotoText: { fontFamily: font.sans, fontSize: 11.5, color: design.ink3 },
  hint: { fontFamily: font.sans, fontSize: 12, color: design.ink3, marginTop: -6 },

  where: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginTop: 12,
    backgroundColor: design.mint, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10,
  },
  whereWarn: { backgroundColor: 'rgba(200,96,43,0.1)' },
  whereText: { flex: 1, fontFamily: font.sansMed, fontSize: 12.5, color: colors.forest },
  whereTextWarn: { color: colors.ember },

  bottomBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0, paddingTop: 12, paddingHorizontal: 16,
    backgroundColor: 'rgba(244,241,234,0.97)', borderTopWidth: 1, borderTopColor: design.line,
  },
  submit: {
    flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center',
    paddingVertical: 15, borderRadius: 14, backgroundColor: colors.forest,
  },
  submitText: { fontFamily: font.sansSemi, fontSize: 15.5, color: '#f4f1ea' },

  backdrop: { flex: 1, backgroundColor: 'rgba(20,20,15,0.4)' },
  sheet: { backgroundColor: design.paper, borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: 16, paddingTop: 10 },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: design.line, marginBottom: 12 },
  sheetTitle: { fontFamily: font.sansBold, fontSize: 17, color: design.ink, marginBottom: 4, paddingHorizontal: 4 },
  sheetSection: { fontFamily: font.sansSemi, fontSize: 12, color: design.ink3, paddingTop: 14, paddingBottom: 6, paddingHorizontal: 4 },
  option: {
    flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 4,
    borderBottomWidth: 1, borderBottomColor: design.lineLight,
  },
  optionEmoji: { fontSize: 20, width: 28, textAlign: 'center' },
  optionText: { flex: 1, fontFamily: font.sans, fontSize: 15.5, color: design.ink2 },
  optionOn: { fontFamily: font.sansSemi, color: colors.forest },
});
