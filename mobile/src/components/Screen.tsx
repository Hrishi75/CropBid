import { type ReactNode } from 'react';
import { View } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

// Standard screen wrapper: cream background + horizontal padding.
// Auth screens (no nav header) keep the default top edge; tab screens that
// already render a header should pass edges={['left', 'right']}.
export default function Screen({
  children,
  edges = ['top', 'left', 'right'],
}: {
  children: ReactNode;
  edges?: readonly Edge[];
}) {
  return (
    <SafeAreaView edges={edges} className="flex-1 bg-surface-alt">
      <View className="flex-1 px-5 pt-4">{children}</View>
    </SafeAreaView>
  );
}
