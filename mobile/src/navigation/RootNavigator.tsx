import { NavigationContainer } from '@react-navigation/native';

import { useSession } from '../context/SessionContext';
import AppTabs from './AppTabs';
import AuthStack from './AuthStack';

export default function RootNavigator() {
  const { isSignedIn } = useSession();

  return (
    <NavigationContainer>
      {isSignedIn ? <AppTabs /> : <AuthStack />}
    </NavigationContainer>
  );
}
