// =============================================================================
// StatusScrim — the strip behind the status bar on a scrolling tab screen
// =============================================================================
// Tab screens pad their content below the notch, and then scroll it straight
// up under the clock, where the time sat on top of whatever card passed
// beneath ("STATE Maharashtra" behind 2:07). A page-coloured strip pinned over
// the status-bar area hides what scrolls under it, the way a native large-title
// screen does. Wrapped around every tab screen by the navigators
// (`screenLayout`), so no screen has to remember it.
// =============================================================================

import React from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { design } from '../theme';

export function WithStatusScrim({ children, color = design.bg }: { children: React.ReactNode; color?: string }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1 }}>
      {children}
      <View
        pointerEvents="none"
        style={{ position: 'absolute', top: 0, left: 0, right: 0, height: insets.top, backgroundColor: color }}
      />
    </View>
  );
}
