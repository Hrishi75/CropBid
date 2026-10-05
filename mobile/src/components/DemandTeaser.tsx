// =============================================================================
// DemandTeaser — the way onto the demand board from a seller's home screen
// =============================================================================
// The demand board is the other half of the market: buyers saying what they
// need and at what price. A farmer could only reach it from a quick action at
// the bottom of My Farm or a row in their profile, so most never found out it
// existed. This card puts it at the top of Home, with the live count and the
// crops being asked for, because "6 buyers want onion, potato, rice" is a
// reason to tap and "Demand board" is not.
//
// Renders nothing when the board is empty or the fetch fails: an empty card
// at the top of Home is noise, and a failed one is not the farmer's problem.
// =============================================================================

import React, { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Mono } from './buyerKit';
import { PressScale } from './motion';
import { requirementFeed } from '../api/endpoints';
import { cropEmojiFor } from '../utils/cropImages';
import { colors, design, font } from '../theme';

export function DemandTeaser({ onOpen }: { onOpen: () => void }) {
  const [total, setTotal] = useState(0);
  const [crops, setCrops] = useState<string[]>([]);

  // On focus, so a requirement filled or posted elsewhere is reflected when
  // the farmer comes back to Home.
  useFocusEffect(
    useCallback(() => {
      let on = true;
      requirementFeed({ limit: 12, sort: 'createdAt' })
        .then((page) => {
          if (!on) return;
          setTotal(page.pagination.total);
          // Distinct crops in the order they were asked for, newest first.
          const seen: string[] = [];
          for (const r of page.requirements) {
            if (!seen.some((c) => c.toLowerCase() === r.cropName.toLowerCase())) seen.push(r.cropName);
          }
          setCrops(seen);
        })
        .catch(() => { if (on) setTotal(0); });
      return () => { on = false; };
    }, []),
  );

  if (total === 0) return null;

  const shown = crops.slice(0, 4);
  const more = crops.length - shown.length;

  return (
    <PressScale onPress={onOpen} scaleTo={0.98} cardStyle={styles.card}>
      <View style={styles.top}>
        <View style={styles.live}>
          <View style={styles.dot} />
          <Mono style={styles.eyebrow}>BUYERS ARE ASKING</Mono>
        </View>
        <Text style={styles.cta}>See all →</Text>
      </View>
      <Text style={styles.title}>
        {total} open {total === 1 ? 'request' : 'requests'} from buyers
      </Text>
      <Text style={styles.sub}>Fill one at their price, or counter with yours.</Text>
      <View style={styles.crops}>
        {shown.map((c) => (
          <View key={c} style={styles.crop}>
            <Text style={styles.cropEmoji}>{cropEmojiFor(c)}</Text>
            <Text style={styles.cropName} numberOfLines={1}>{c}</Text>
          </View>
        ))}
        {more > 0 ? (
          <View style={styles.crop}>
            <Text style={styles.cropName}>+{more} more</Text>
          </View>
        ) : null}
      </View>
    </PressScale>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 16, marginTop: 14,
    backgroundColor: colors.forest, borderRadius: 20,
    padding: 16, gap: 6,
    shadowColor: colors.forest, shadowOpacity: 0.2, shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 }, elevation: 6,
  },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  live: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.ember2 },
  eyebrow: { fontSize: 9.5, letterSpacing: 0.9, color: design.leaf },
  cta: { fontFamily: font.sansSemi, fontSize: 13, color: design.leaf },
  title: { fontFamily: font.sansBold, fontSize: 18, letterSpacing: -0.3, color: colors.textInverse, marginTop: 4 },
  sub: { fontFamily: font.sans, fontSize: 12.5, color: 'rgba(244,241,234,0.72)' },
  crops: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  crop: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(244,241,234,0.1)', borderRadius: 999,
    paddingHorizontal: 10, paddingVertical: 5,
  },
  cropEmoji: { fontSize: 13 },
  cropName: { fontFamily: font.sansMed, fontSize: 12, color: colors.textInverse },
});
