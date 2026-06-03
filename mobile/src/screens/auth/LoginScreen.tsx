import { Pressable, Text, View } from 'react-native';
import { type NativeStackScreenProps } from '@react-navigation/native-stack';

import Screen from '../../components/Screen';
import { useSession } from '../../context/SessionContext';
import { type AuthStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<AuthStackParamList, 'Login'>;

export default function LoginScreen({ navigation }: Props) {
  const { signIn } = useSession();

  return (
    <Screen>
      <View className="flex-1 justify-center">
        <Text className="text-4xl font-semibold text-forest">CropBid</Text>
        <Text className="mt-2 text-base text-ink-2">Sign in to your account</Text>

        {/* Real email/password form is wired in step 5 (auth + API). */}
        <Pressable
          onPress={signIn}
          className="mt-8 items-center rounded-full bg-forest py-3 active:opacity-80"
        >
          <Text className="font-medium text-ink-inverse">Continue (dev)</Text>
        </Pressable>

        <Pressable onPress={() => navigation.navigate('Signup')} className="mt-5 items-center">
          <Text className="text-ink-3">No account? Sign up</Text>
        </Pressable>
      </View>
    </Screen>
  );
}
