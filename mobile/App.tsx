import { StatusBar } from 'expo-status-bar';
import { Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import './global.css';

export default function App() {
  return (
    <SafeAreaProvider>
      <SafeAreaView className="flex-1 bg-surface-alt">
        <View className="flex-1 items-center justify-center px-6">
          <View className="rounded-2xl border border-border bg-paper px-6 py-8 items-center">
            <Text className="text-3xl font-semibold text-forest">CropBid</Text>
            <Text className="mt-2 text-center text-base text-ink-2">
              AI-powered agricultural marketplace
            </Text>
            <View className="mt-5 rounded-full bg-forest px-5 py-2">
              <Text className="text-sm font-medium text-ink-inverse">
                NativeWind styling active
              </Text>
            </View>
          </View>
        </View>
        <StatusBar style="dark" />
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
