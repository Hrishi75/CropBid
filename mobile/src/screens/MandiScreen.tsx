// =============================================================================
// Mandi screen — one section, two tabs: Live rates ⇄ Price forecast
// =============================================================================
// Registered as the 'Rates' route in every stack. The segmented switcher
// (components/MandiTabs) flips local state, so switching tabs is instant —
// no navigation, no screen transition. Both bodies stay mounted after first
// use (hidden with display:none) so scroll position, expanded cards and
// fetched data survive toggling; the forecast body mounts lazily on first
// open so the rates-only visit never calls the prediction engine. The native
// header title follows the active tab via navigation.setOptions.
// Open directly on the forecast with navigate('Rates', { tab: 'forecast' }).

import React, { useLayoutEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import MandiTabs, { type MandiTab } from '../components/MandiTabs';
import { RatesBody } from './RatesScreen';
import { ForecastBody } from './ForecastScreen';
import { design } from '../theme';

export default function MandiScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const route = useRoute();
  const initial: MandiTab =
    (route.params as { tab?: MandiTab } | undefined)?.tab === 'forecast' ? 'forecast' : 'rates';

  const [tab, setTab] = useState<MandiTab>(initial);
  const [forecastMounted, setForecastMounted] = useState(initial === 'forecast');

  useLayoutEffect(() => {
    navigation.setOptions({ title: tab === 'rates' ? t("Today's mandi rates") : t('Price forecast') });
  }, [navigation, tab, t]);

  const onChange = (next: MandiTab) => {
    if (next === 'forecast') setForecastMounted(true);
    setTab(next);
  };

  return (
    <View style={styles.flex}>
      <MandiTabs active={tab} onChange={onChange} />
      <View style={[styles.flex, tab !== 'rates' && styles.hidden]}>
        <RatesBody />
      </View>
      {forecastMounted && (
        <View style={[styles.flex, tab !== 'forecast' && styles.hidden]}>
          <ForecastBody />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: design.bg },
  hidden: { display: 'none' },
});
