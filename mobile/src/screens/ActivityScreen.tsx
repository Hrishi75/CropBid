import { Text, View } from 'react-native';

import Screen from '../components/Screen';

export default function ActivityScreen() {
  return (
    <Screen edges={['left', 'right']}>
      <View className="flex-1">
        <Text className="text-2xl font-semibold text-ink">Activity</Text>
        <Text className="mt-2 text-ink-2">
          Bids, negotiations, and transactions will appear here.
        </Text>
      </View>
    </Screen>
  );
}
