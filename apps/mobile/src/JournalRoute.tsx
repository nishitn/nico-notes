import { useEffect } from 'react';
import { useNavigation, useRoute } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SafeAreaView as NativeSafeAreaView } from 'react-native-screens/experimental';
import { JournalScreen } from './JournalScreen';
import { useJournal } from './JournalContext';
import type { ScreenProps } from './navigation';
import { styles } from './ui';

export function journalTab(tab: 'home' | 'notifications' | 'settings') {
  return function JournalTab() {
    const navigation = useNavigation<ScreenProps<'Boards'>['navigation']>();
    return (
      <SafeAreaView edges={['top', 'left', 'right']} style={styles.page}>
        <NativeSafeAreaView edges={{ bottom: true }} style={styles.page}>
          <JournalScreen navigation={navigation} tab={tab} />
        </NativeSafeAreaView>
      </SafeAreaView>
    );
  };
}

export function journalSection(section: 'visits' | 'wishlist') {
  return function JournalSection() {
    const navigation = useNavigation<ScreenProps<'Boards'>['navigation']>();
    const { params } = useRoute<ScreenProps<'JournalVisits'>['route']>();
    const { setSelectedId } = useJournal();
    useEffect(() => setSelectedId(params.boardId), [params.boardId, setSelectedId]);
    return (
      <SafeAreaView edges={['top', 'bottom', 'left', 'right']} style={styles.page}>
        <JournalScreen navigation={navigation} section={section} />
      </SafeAreaView>
    );
  };
}
