import { Text, View } from 'react-native';

import Screen from '../components/Screen';

export default function BrowseScreen() {
  return (
    <Screen edges={['left', 'right']}>
      <View className="flex-1">
        <Text className="text-2xl font-semibold text-ink">Browse crops</Text>
        <Text className="mt-2 text-ink-2">
          Listings with filters + smart-match scoring land here once the API client is wired.
        </Text>
      </View>
    </Screen>
  );
}
