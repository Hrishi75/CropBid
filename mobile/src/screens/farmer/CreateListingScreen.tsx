// Farmer app · Create / edit a listing — mirrors the web CreateListing form.
// Create posts multipart/form-data (with photos via expo-image-picker); edit
// sends a JSON body (PUT /listings/:id). Crop & state use a tap-to-open modal
// picker; unit & grade use inline pill groups.
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  SectionList,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as ImagePicker from 'expo-image-picker';
import { Eyebrow } from '../../components/buyerKit';
import { IconArrow, IconChevR } from '../../components/icons';
import { colors, design, font } from '../../theme';
import { useAuth } from '../../context/AuthContext';
import { createListing, fetchListing, updateListing } from '../../api/endpoints';
import { errorMessage, mediaUrl } from '../../api/client';
import type { FarmerStackParamList } from '../../navigation/types';
import { money, unitLabel } from '../../lib/format';
import { mspForCrop } from '../../lib/msp';
import { CROP_CATEGORIES } from '../../lib/crops';

const INDIAN_STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh',
  'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka',
  'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram',
  'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu',
  'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal', 'Delhi',
];

const UNITS: { v: string; label: string }[] = [
  { v: 'KG', label: 'KG' },
  { v: 'QUINTAL', label: 'Quintal' },
  { v: 'TONNE', label: 'Tonne' },
];
const GRADES: { v: string; label: string }[] = [
  { v: 'A', label: 'A · Premium' },
  { v: 'B', label: 'B · Standard' },
  { v: 'C', label: 'C · Economy' },
];

type Props = NativeStackScreenProps<FarmerStackParamList, 'CreateListing'>;

export default function CreateListingScreen({ route, navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const editId = route.params?.id;
  const isEdit = Boolean(editId);

  const [cropName, setCropName] = useState('');
  const [cropVariety, setCropVariety] = useState('');
  const [quantity, setQuantity] = useState('');
  const [unit, setUnit] = useState('QUINTAL');
  const [qualityGrade, setQualityGrade] = useState('A');
  const [priceMin, setPriceMin] = useState('');
  const [priceMax, setPriceMax] = useState('');
  const [harvestDate, setHarvestDate] = useState('');
  const [description, setDescription] = useState('');
  const [organic, setOrganic] = useState(false);
  const [location, setLocation] = useState('');
  const [stateName, setStateName] = useState('');
  const [picked, setPicked] = useState<ImagePicker.ImagePickerAsset[]>([]);
  const [existingImages, setExistingImages] = useState<string[]>([]);

  const [fetching, setFetching] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [picker, setPicker] = useState<null | 'crop' | 'state'>(null);

  const currency = user?.currency || 'INR';

  useEffect(() => {
    if (!editId) return;
    fetchListing(editId)
      .then((l) => {
        setCropName(l.cropName || '');
        setCropVariety(l.cropVariety || '');
        setQuantity(String(l.quantity ?? ''));
        setUnit(l.unit || 'QUINTAL');
        setQualityGrade(l.qualityGrade || 'A');
        setPriceMin(String(l.pricePerUnitMin ?? ''));
        setPriceMax(String(l.pricePerUnitMax ?? ''));
        setHarvestDate(l.harvestDate ? l.harvestDate.split('T')[0] : '');
        setDescription(l.description || '');
        setOrganic(l.organic || false);
        setLocation(l.location || '');
        setStateName(l.state || '');
        setExistingImages(l.images ?? []);
      })
      .catch((e) => {
        Alert.alert('Could not load listing', errorMessage(e));
        navigation.goBack();
      })
      .finally(() => setFetching(false));
  }, [editId]);

  async function pickImages() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission needed', 'Allow photo access to attach images to your listing.');
      return;
    }
    const remaining = Math.max(1, 5 - picked.length);
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: remaining,
      quality: 0.8,
    });
    if (!result.canceled) {
      setPicked((prev) => [...prev, ...result.assets].slice(0, 5));
    }
  }

  function removePicked(uri: string) {
    setPicked((prev) => prev.filter((a) => a.uri !== uri));
  }

  async function onSubmit() {
    const minN = Number(priceMin);
    const maxN = Number(priceMax);
    const qtyN = Number(quantity);
    if (!cropName || !location || !stateName) {
      Alert.alert('Missing details', 'Crop, location and state are required.');
      return;
    }
    if (!(qtyN > 0)) {
      Alert.alert('Invalid quantity', 'Enter a quantity greater than zero.');
      return;
    }
    if (!(minN > 0) || !(maxN > 0)) {
      Alert.alert('Invalid price', 'Enter a floor and ideal price.');
      return;
    }
    if (minN > maxN) {
      Alert.alert('Invalid price', 'Floor price cannot exceed the ideal price.');
      return;
    }

    // Government MSP guard — warn (but don't block) when the floor is below the
    // official support price for this crop.
    const msp = mspForCrop(cropName, unit);
    if (msp != null && minN < msp) {
      Alert.alert(
        'Floor below government MSP',
        `The government MSP for ${cropName} is ${money(msp, currency)}/${unitLabel(unit)}. ` +
          `Your floor of ${money(minN, currency)}/${unitLabel(unit)} is below it — you may sell under the support price.`,
        [
          { text: 'Edit price', style: 'cancel' },
          { text: 'List anyway', style: 'destructive', onPress: save },
        ],
      );
      return;
    }

    save();
  }

  async function save() {
    const minN = Number(priceMin);
    const maxN = Number(priceMax);
    const qtyN = Number(quantity);
    setSaving(true);
    try {
      if (isEdit && editId) {
        await updateListing(editId, {
          cropName,
          cropVariety: cropVariety || undefined,
          quantity: qtyN,
          unit,
          qualityGrade,
          pricePerUnitMin: minN,
          pricePerUnitMax: maxN,
          currency,
          harvestDate: harvestDate || undefined,
          description: description || undefined,
          organic,
          location,
          country: user?.country || 'India',
          state: stateName,
        });
      } else {
        const form = new FormData();
        form.append('cropName', cropName);
        if (cropVariety) form.append('cropVariety', cropVariety);
        form.append('quantity', String(qtyN));
        form.append('unit', unit);
        form.append('qualityGrade', qualityGrade);
        form.append('pricePerUnitMin', String(minN));
        form.append('pricePerUnitMax', String(maxN));
        form.append('currency', currency);
        if (harvestDate) form.append('harvestDate', harvestDate);
        if (description) form.append('description', description);
        form.append('organic', String(organic));
        form.append('location', location);
        form.append('country', user?.country || 'India');
        form.append('state', stateName);
        picked.forEach((asset, i) => {
          form.append('images', {
            uri: asset.uri,
            name: asset.fileName ?? `photo-${i}.jpg`,
            type: asset.mimeType ?? 'image/jpeg',
          } as unknown as Blob);
        });
        await createListing(form);
      }
      navigation.goBack();
    } catch (e) {
      Alert.alert(isEdit ? 'Could not update listing' : 'Could not publish listing', errorMessage(e));
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

  const minN = Number(priceMin) || 0;
  const maxN = Number(priceMax) || 0;
  const totalPhotos = existingImages.length + picked.length;

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 110 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.headerPad}>
          <Pressable onPress={() => navigation.goBack()} hitSlop={10} style={styles.backRow}>
            <View style={{ transform: [{ rotate: '180deg' }] }}>
              <IconChevR size={15} stroke={design.ink2} />
            </View>
            <Text style={styles.backText}>  Listings</Text>
          </Pressable>
          <Text style={styles.h1}>{isEdit ? 'Edit listing' : 'List a crop'}</Text>
          <Text style={styles.lede}>Set crop, grade, and your floor/ideal price. Your agent takes it from there.</Text>
        </View>

        {/* Crop */}
        <Section title="Crop">
          <PickerField label="Crop" value={cropName || 'Select crop'} placeholder={!cropName} onPress={() => setPicker('crop')} />
          <Field label="Variety (optional)">
            <TextInput
              style={styles.input}
              value={cropVariety}
              onChangeText={setCropVariety}
              placeholder="e.g. Basmati, Sharbati"
              placeholderTextColor={design.ink3}
            />
          </Field>
        </Section>

        {/* Volume & grade */}
        <Section title="Volume & grade">
          <View style={styles.row2}>
            <Field label="Quantity" style={{ flex: 1 }}>
              <TextInput
                style={styles.input}
                value={quantity}
                onChangeText={setQuantity}
                keyboardType="numeric"
                placeholder="e.g. 50"
                placeholderTextColor={design.ink3}
              />
            </Field>
            <Field label="Unit" style={{ flex: 1 }}>
              <View style={styles.pillRow}>
                {UNITS.map((u) => (
                  <Pill key={u.v} active={unit === u.v} label={u.label} onPress={() => setUnit(u.v)} />
                ))}
              </View>
            </Field>
          </View>
          <Field label="Quality grade">
            <View style={styles.pillRow}>
              {GRADES.map((g) => (
                <Pill key={g.v} active={qualityGrade === g.v} label={g.label} onPress={() => setQualityGrade(g.v)} />
              ))}
            </View>
          </Field>
        </Section>

        {/* Price */}
        <Section title="Price · per unit">
          <Text style={styles.hint}>Floor = won't sell below. Ideal = your target price.</Text>
          <View style={styles.row2}>
            <Field label="Floor" style={{ flex: 1 }}>
              <TextInput
                style={styles.input}
                value={priceMin}
                onChangeText={setPriceMin}
                keyboardType="numeric"
                placeholder="e.g. 2000"
                placeholderTextColor={design.ink3}
              />
            </Field>
            <Field label="Ideal" style={{ flex: 1 }}>
              <TextInput
                style={styles.input}
                value={priceMax}
                onChangeText={setPriceMax}
                keyboardType="numeric"
                placeholder="e.g. 2800"
                placeholderTextColor={design.ink3}
              />
            </Field>
          </View>
          {minN > 0 && maxN > 0 ? (
            <Text style={styles.previewPrice}>
              {money(minN, currency)} – {money(maxN, currency)} / {unit.toLowerCase()}
            </Text>
          ) : null}
        </Section>

        {/* Logistics */}
        <Section title="Logistics">
          <Field label="Location (city)">
            <TextInput
              style={styles.input}
              value={location}
              onChangeText={setLocation}
              placeholder="e.g. Nashik"
              placeholderTextColor={design.ink3}
            />
          </Field>
          <PickerField label="State" value={stateName || 'Select state'} placeholder={!stateName} onPress={() => setPicker('state')} />
          <Field label="Harvest date (optional)">
            <TextInput
              style={styles.input}
              value={harvestDate}
              onChangeText={setHarvestDate}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={design.ink3}
              autoCapitalize="none"
            />
          </Field>
        </Section>

        {/* Notes */}
        <Section title="Notes">
          <Field label="Description (optional)">
            <TextInput
              style={[styles.input, styles.multiline]}
              value={description}
              onChangeText={setDescription}
              multiline
              placeholder="Quality, storage, certifications…"
              placeholderTextColor={design.ink3}
            />
          </Field>
          <View style={styles.organicRow}>
            <Text style={styles.organicLabel}>Organic certified</Text>
            <Switch
              value={organic}
              onValueChange={setOrganic}
              trackColor={{ true: colors.sage, false: design.line }}
              thumbColor="#fff"
            />
          </View>
        </Section>

        {/* Photos */}
        <Section title={`Photos · ${totalPhotos}/5`}>
          {isEdit && existingImages.length > 0 ? (
            <>
              <Text style={styles.hint}>Existing photos (manage new uploads on the web).</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.thumbRow}>
                {existingImages.map((src) => {
                  const uri = mediaUrl(src);
                  return uri ? <Image key={src} source={{ uri }} style={styles.photo} /> : null;
                })}
              </ScrollView>
            </>
          ) : null}
          {!isEdit ? (
            <>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.thumbRow}>
                {picked.map((a) => (
                  <Pressable key={a.uri} onPress={() => removePicked(a.uri)} style={styles.photoWrap}>
                    <Image source={{ uri: a.uri }} style={styles.photo} />
                    <View style={styles.photoX}>
                      <Text style={styles.photoXText}>×</Text>
                    </View>
                  </Pressable>
                ))}
                {picked.length < 5 ? (
                  <Pressable style={styles.addPhoto} onPress={pickImages}>
                    <Text style={styles.addPhotoPlus}>+</Text>
                    <Text style={styles.addPhotoText}>Add</Text>
                  </Pressable>
                ) : null}
              </ScrollView>
            </>
          ) : null}
        </Section>
      </ScrollView>

      {/* sticky submit */}
      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 12 }]}>
        <Pressable
          onPress={onSubmit}
          disabled={saving}
          style={({ pressed }) => [styles.submit, (pressed || saving) && { opacity: 0.85 }]}
        >
          {saving ? (
            <ActivityIndicator color="#f4f1ea" size="small" />
          ) : (
            <>
              <Text style={styles.submitText}>{isEdit ? 'Save changes' : 'Publish lot'} </Text>
              <IconArrow size={14} stroke="#f4f1ea" />
            </>
          )}
        </Pressable>
      </View>

      {/* option picker modal */}
      <Modal visible={picker !== null} transparent animationType="slide" onRequestClose={() => setPicker(null)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setPicker(null)} />
        <View style={[styles.modalSheet, { paddingBottom: insets.bottom + 8 }]}>
          <View style={styles.modalHandle} />
          <Text style={styles.modalTitle}>{picker === 'crop' ? 'Select crop' : 'Select state'}</Text>
          {picker === 'crop' ? (
            <SectionList
              sections={CROP_CATEGORIES.map((c) => ({ title: `${c.icon}  ${c.name}`, data: c.crops }))}
              keyExtractor={(item) => item}
              style={{ maxHeight: 420 }}
              stickySectionHeadersEnabled={false}
              keyboardShouldPersistTaps="handled"
              renderSectionHeader={({ section }) => <Text style={styles.sectionHeader}>{section.title}</Text>}
              renderItem={({ item }) => {
                const selected = item === cropName;
                return (
                  <Pressable
                    style={styles.optionRow}
                    onPress={() => {
                      setCropName(item);
                      setPicker(null);
                    }}
                  >
                    <Text style={[styles.optionText, selected && styles.optionTextActive]}>{item}</Text>
                    {selected ? <Text style={styles.optionCheck}>✓</Text> : null}
                  </Pressable>
                );
              }}
            />
          ) : (
            <FlatList
              data={INDIAN_STATES}
              keyExtractor={(item) => item}
              style={{ maxHeight: 360 }}
              renderItem={({ item }) => {
                const selected = item === stateName;
                return (
                  <Pressable
                    style={styles.optionRow}
                    onPress={() => {
                      setStateName(item);
                      setPicker(null);
                    }}
                  >
                    <Text style={[styles.optionText, selected && styles.optionTextActive]}>{item}</Text>
                    {selected ? <Text style={styles.optionCheck}>✓</Text> : null}
                  </Pressable>
                );
              }}
            />
          )}
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Eyebrow style={{ marginBottom: 12 }}>{title}</Eyebrow>
      <View style={{ gap: 14 }}>{children}</View>
    </View>
  );
}

function Field({ label, children, style }: { label: string; children: React.ReactNode; style?: any }) {
  return (
    <View style={style}>
      <Text style={styles.label}>{label}</Text>
      {children}
    </View>
  );
}

function PickerField({ label, value, placeholder, onPress }: { label: string; value: string; placeholder?: boolean; onPress: () => void }) {
  return (
    <Field label={label}>
      <Pressable style={styles.input} onPress={onPress}>
        <View style={styles.pickerRow}>
          <Text style={[styles.pickerValue, placeholder && { color: design.ink3 }]}>{value}</Text>
          <IconChevR size={14} stroke={design.ink3} />
        </View>
      </Pressable>
    </Field>
  );
}

function Pill({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.pill, active ? styles.pillActive : styles.pillIdle]}>
      <Text style={[styles.pillText, { color: active ? '#f4f1ea' : design.ink2 }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: design.bg },
  headerPad: { paddingHorizontal: 20, paddingBottom: 8 },
  backRow: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', paddingVertical: 4 },
  backText: { fontFamily: font.sansMed, fontSize: 13, color: design.ink2 },
  h1: { marginTop: 10, fontFamily: font.sansMed, fontSize: 27, letterSpacing: -0.7, color: design.ink },
  lede: { marginTop: 6, fontFamily: font.sans, fontSize: 14, lineHeight: 20, color: design.ink3 },

  section: { paddingHorizontal: 20, paddingVertical: 16, borderTopWidth: 1, borderTopColor: design.line, marginTop: 8 },
  label: { fontFamily: font.sansMed, fontSize: 12.5, color: design.ink2, marginBottom: 6 },
  hint: { fontFamily: font.sans, fontSize: 12.5, color: design.ink3, marginBottom: 2 },
  row2: { flexDirection: 'row', gap: 12 },

  input: {
    borderWidth: 1,
    borderColor: design.line,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontFamily: font.sans,
    fontSize: 15.5,
    color: design.ink,
    backgroundColor: design.paper,
  },
  multiline: { minHeight: 80, textAlignVertical: 'top' },
  pickerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  pickerValue: { fontFamily: font.sans, fontSize: 15.5, color: design.ink },

  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: { paddingVertical: 9, paddingHorizontal: 13, borderRadius: 10 },
  pillActive: { backgroundColor: colors.forest },
  pillIdle: { backgroundColor: design.paper, borderWidth: 1, borderColor: design.line },
  pillText: { fontFamily: font.sansMed, fontSize: 13 },

  previewPrice: { fontFamily: font.monoSemi, fontSize: 16, color: colors.forest, marginTop: 2 },

  organicRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  organicLabel: { fontFamily: font.sansMed, fontSize: 14.5, color: design.ink },

  thumbRow: { gap: 10, paddingVertical: 4 },
  photoWrap: { position: 'relative' },
  photo: { width: 76, height: 76, borderRadius: 12, backgroundColor: design.paper2 },
  photoX: { position: 'absolute', top: -6, right: -6, width: 22, height: 22, borderRadius: 999, backgroundColor: colors.ember, alignItems: 'center', justifyContent: 'center' },
  photoXText: { color: '#fff', fontSize: 15, lineHeight: 18, fontWeight: '700' },
  addPhoto: { width: 76, height: 76, borderRadius: 12, borderWidth: 1, borderColor: design.line, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', backgroundColor: design.paper },
  addPhotoPlus: { fontSize: 22, color: design.ink3, lineHeight: 24 },
  addPhotoText: { fontFamily: font.sans, fontSize: 11.5, color: design.ink3 },

  bottomBar: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingTop: 12, paddingHorizontal: 16, backgroundColor: 'rgba(244,241,234,0.97)', borderTopWidth: 1, borderTopColor: design.line },
  submit: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 15, borderRadius: 12, backgroundColor: colors.forest },
  submitText: { fontFamily: font.sansSemi, fontSize: 15.5, color: '#f4f1ea' },

  modalBackdrop: { flex: 1, backgroundColor: 'rgba(20,20,15,0.4)' },
  modalSheet: { backgroundColor: design.paper, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 16, paddingTop: 10 },
  modalHandle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 999, backgroundColor: design.line, marginBottom: 12 },
  modalTitle: { fontFamily: font.sansMed, fontSize: 17, color: design.ink, marginBottom: 8, paddingHorizontal: 4 },
  sectionHeader: { fontFamily: font.sansSemi, fontSize: 12, letterSpacing: 0.3, color: design.ink3, backgroundColor: design.paper, paddingTop: 14, paddingBottom: 6, paddingHorizontal: 4 },
  optionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: design.lineLight },
  optionText: { fontFamily: font.sans, fontSize: 15.5, color: design.ink2 },
  optionTextActive: { fontFamily: font.sansSemi, color: colors.forest },
  optionCheck: { fontFamily: font.sansSemi, fontSize: 15, color: colors.forest },
});
