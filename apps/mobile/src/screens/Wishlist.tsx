import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useMutation } from 'convex/react';
import { api } from '@nico-notes/backend/api';
import type { ScreenProps } from '../navigation';
import { Button, ErrorNote, Loading, Page, styles } from '../ui';
import { PlaceTopBar } from './Places';

/** Legacy wishlist links resolve atomically to the shared visit screen. */
export function WishlistScreen({ route, navigation }: ScreenProps<'Wishlist'>) {
  const ensure = useMutation(api.wishlist.ensureVisit);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    void ensure({ id: route.params.id }).then(
      (visitId) => {
        if (active) navigation.replace('Visit', { visitId });
      },
      () => {
        if (active) setError('Unable to open this planned visit. It may have been removed.');
      },
    );
    return () => {
      active = false;
    };
  }, [ensure, route.params.id, navigation, attempt]);
  return (
    <View style={styles.page}>
      <PlaceTopBar navigation={navigation} />
      {error ? (
        <Page>
          <ErrorNote error={error} />
          <Button
            title="Try again"
            onPress={() => {
              setError('');
              setAttempt((value) => value + 1);
            }}
          />
        </Page>
      ) : (
        <Loading />
      )}
    </View>
  );
}
