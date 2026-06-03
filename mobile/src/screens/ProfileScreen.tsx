import { Pressable, Text, View } from 'react-native';

import Screen from '../components/Screen';
import { useSession } from '../context/SessionContext';

export default function ProfileScreen() {
  const { signOut } = useSession();

  return (
    <Screen edges={['left', 'right']}>
      <View className="flex-1">
        <Text className="text-2xl font-semibold text-ink">Profile</Text>
        <Text className="mt-2 text-ink-2">Account details and trust score go here.</Text>

        <Pressable
          onPress={signOut}
          className="mt-8 items-center rounded-full border border-border py-3 active:opacity-70"
        >
          <Text className="font-medium text-ember">Sign out</Text>
        </Pressable>
      </View>
    </Screen>
  );
}
