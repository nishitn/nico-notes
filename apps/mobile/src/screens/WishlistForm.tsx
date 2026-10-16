import { useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { api } from '@nico-notes/backend/api';
import type { ScreenProps } from '../navigation';
import { Button, ErrorNote, Field, Loading, Page, SectionCard, Title, useTask } from '../ui';

export function WishlistFormScreen({ route, navigation }: ScreenProps<'WishlistForm'>) {
  const { boardId } = route.params;
  const board = useQuery(api.boards.get, { boardId });
  const [title, setTitle] = useState(route.params.title ?? '');
  const [place, setPlace] = useState(route.params.place ?? '');
  const [notes, setNotes] = useState(route.params.notes ?? '');
  const [link, setLink] = useState(route.params.link ?? '');
  const add = useMutation(api.wishlist.add);
  const task = useTask();

  if (!board) return <Loading />;

  return (
    <Page>
      <Title>Somewhere new to try.</Title>
      <SectionCard title="Wishlist place" icon="bookmark-outline">
        <Field
          label="Place or spot name"
          value={title}
          onChangeText={setTitle}
          placeholder="e.g. Toit, Glen’s Bakehouse"
          maxLength={120}
        />
        <Field
          label="Address or area"
          value={place}
          onChangeText={setPlace}
          placeholder="e.g. Indiranagar, Bangalore"
          maxLength={250}
        />
        <Field
          label="Notes (what to try / recommendation)"
          value={notes}
          onChangeText={setNotes}
          placeholder="e.g. Try the sourdough pizza and craft beer"
          multiline
          maxLength={500}
        />
        <Field
          label="Link (optional)"
          value={link}
          onChangeText={setLink}
          placeholder="https://…"
          autoCapitalize="none"
          keyboardType="url"
          maxLength={500}
        />
      </SectionCard>
      <ErrorNote error={task.error} />
      <Button
        title={task.busy ? 'Saving…' : 'Save to wishlist'}
        disabled={task.busy || !title.trim()}
        onPress={() =>
          void task.run(async () => {
            await add({
              boardId,
              title: title.trim(),
              place: place.trim() || undefined,
              notes: notes.trim() || undefined,
              link: link.trim() || undefined,
              location: route.params.location,
              googlePlaceId: route.params.googlePlaceId,
            });
            navigation.goBack();
          })
        }
      />
    </Page>
  );
}
