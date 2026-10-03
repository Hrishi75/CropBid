// =============================================================================
// NotificationBell — the bell in the home header, with an unread count
// =============================================================================
// Notifications used to be reachable only from My Farm's header or a row in
// the profile, so a farmer on Home never learnt an offer had arrived. The bell
// sits beside the avatar on Home for every signed-in account.
//
// The count is read on focus rather than streamed: Home is where people come
// back to, so coming back is when it is worth refreshing. Renders nothing when
// signed out, because a guest has no notifications to have.
// =============================================================================

import React, { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { PressScale } from './motion';
import { IconBell2 } from './icons';
import { unreadNotificationCount } from '../api/endpoints';
import { useAuth } from '../context/AuthContext';
import { colors, design, font } from '../theme';

export function NotificationBell() {
  const nav = useNavigation<any>();
  const { user } = useAuth();
  const [unread, setUnread] = useState(0);

  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      let on = true;
      unreadNotificationCount()
        .then((n) => { if (on) setUnread(n); })
        // A header badge is not the place to report a failed fetch.
        .catch(() => {});
      return () => { on = false; };
    }, [user]),
  );

  if (!user) return null;

  return (
    <PressScale
      onPress={() => nav.navigate('Notifications')}
      scaleTo={0.92}
      cardStyle={styles.btn}
    >
      <IconBell2 size={19} stroke={design.ink} />
      {unread > 0 ? (
        <View style={styles.badge} accessibilityLabel={`${unread} unread`}>
          <Text style={styles.badgeText}>{unread > 9 ? '9+' : unread}</Text>
        </View>
      ) : null}
    </PressScale>
  );
}

const styles = StyleSheet.create({
  btn: {
    width: 38, height: 38, borderRadius: 19,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: design.paper, borderWidth: 1, borderColor: design.line,
  },
  badge: {
    position: 'absolute', top: -3, right: -3,
    minWidth: 17, height: 17, borderRadius: 9, paddingHorizontal: 4,
    backgroundColor: colors.ember, borderWidth: 2, borderColor: design.bg,
    alignItems: 'center', justifyContent: 'center',
  },
  badgeText: { fontFamily: font.sansBold, fontSize: 9, lineHeight: 11, color: colors.textInverse },
});
