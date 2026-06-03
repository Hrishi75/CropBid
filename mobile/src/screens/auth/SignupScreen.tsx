import { Pressable, Text, View } from 'react-native';
import { type NativeStackScreenProps } from '@react-navigation/native-stack';

import Screen from '../../components/Screen';
import { type AuthStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<AuthStackParamList, 'Signup'>;

export default function SignupScreen({ navigation }: Props) {
  return (
    <Screen>
      <View className="flex-1 justify-center">
        <Text className="text-4xl font-semibold text-forest">Create account</Text>
        <Text className="mt-2 text-base text-ink-2">Join CropBid as a farmer or buyer</Text>

        {/* Signup form + role onboarding wired in a later step. */}
        <Pressable onPress={() => navigation.goBack()} className="mt-8 items-center">
          <Text className="text-ink-3">Already have an account? Sign in</Text>
        </Pressable>
      </View>
    </Screen>
  );
}
