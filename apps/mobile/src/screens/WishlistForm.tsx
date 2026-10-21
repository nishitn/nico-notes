import { useEffect, useState } from 'react';
import { useMutation } from 'convex/react';
import { api } from '@nico-notes/backend/api';
import type { ScreenProps } from '../navigation';
import { Button, ErrorNote, Loading, Page } from '../ui';
import { VisitFormScreen } from './Visits';

export function WishlistFormScreen({ route, navigation }: ScreenProps<'WishlistForm'>) {
  const ensure = useMutation(api.wishlist.ensureVisit);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!route.params.id) return;
    let active = true;
    void ensure({ id: route.params.id }).then(
      (visitId) => {
        if (active) navigation.replace('VisitForm', { boardId: route.params.boardId, visitId });
      },
      () => {
        if (active) setError('This planned visit is no longer available.');
      },
    );
    return () => {
      active = false;
    };
  }, [ensure, route.params.id, route.params.boardId, navigation]);
  if (route.params.id)
    return error ? (
      <Page>
        <ErrorNote error={error} />
        <Button title="Go back" onPress={() => navigation.goBack()} />
      </Page>
    ) : (
      <Loading />
    );
  return (
    <VisitFormScreen
      route={{
        ...route,
        name: 'VisitForm',
        params: { ...route.params, planned: true, savedLink: route.params.link },
      }}
      navigation={navigation as ScreenProps<'VisitForm'>['navigation']}
    />
  );
}
