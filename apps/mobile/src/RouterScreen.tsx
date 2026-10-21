import type { ComponentType } from 'react';
import { useNavigation, useRoute } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { Routes, ScreenProps } from './navigation';
import { styles } from './ui';

/** Keep existing screen props and native-stack actions within Router's root stack. */
export function screenRoute<T extends keyof Routes>(
  Screen: ComponentType<ScreenProps<T>>,
  nativeHeader = false,
) {
  return function RouterScreen() {
    const navigation = useNavigation<ScreenProps<T>['navigation']>();
    const route = useRoute<ScreenProps<T>['route']>();
    return (
      <SafeAreaView
        edges={nativeHeader ? ['bottom', 'left', 'right'] : ['top', 'bottom', 'left', 'right']}
        style={styles.page}
      >
        <Screen navigation={navigation} route={route} />
      </SafeAreaView>
    );
  };
}
