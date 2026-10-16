import { useState } from 'react';
import { Text, View } from 'react-native';
import { useMutation, useQuery } from 'convex/react';
import { useAuthActions } from '@convex-dev/auth/react';
import { api } from '@nico-notes/backend/api';
import type { Doc, Id } from '@nico-notes/backend/dataModel';
import type { ScreenProps } from '../navigation';
import {
  Avatar,
  Card,
  Button,
  ErrorNote,
  Field,
  Heading,
  Loading,
  Page,
  styles,
  Title,
  useTask,
} from '../ui';
import { JournalScreen } from '../JournalScreen';
import { clearNativeGoogleSession } from '../../modules/google-sign-in';

export { VisitCard } from '../VisitCard';
export function BoardsScreen({ navigation }: ScreenProps<'Boards'>) {
  return <JournalScreen navigation={navigation} />;
}
export function BoardScreen({ route, navigation }: ScreenProps<'Board'>) {
  return <JournalScreen navigation={navigation} initialBoardId={route.params.boardId} />;
}
export function BoardFormScreen({ route, navigation }: ScreenProps<'BoardForm'>) {
  const boardId = route.params?.boardId;
  const data = useQuery(api.boards.get, boardId ? { boardId } : 'skip');
  if (boardId && !data) return <Loading />;
  return (
    <BoardForm
      key={boardId ?? 'new'}
      initial={data?.board}
      onDone={(id) => {
        if (boardId) navigation.goBack();
        else navigation.replace('Board', { boardId: id });
      }}
    />
  );
}
function BoardForm({
  initial,
  onDone,
}: {
  initial?: Doc<'boards'>;
  onDone: (id: Id<'boards'>) => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [accent, setAccent] = useState<Doc<'boards'>['accent']>(initial?.accent ?? 'coral');
  const create = useMutation(api.boards.create);
  const update = useMutation(api.boards.update);
  const task = useTask();
  return (
    <Page>
      <Title>{initial ? 'Make it yours.' : 'A new shared chapter.'}</Title>
      <Field label="Board name" value={name} onChangeText={setName} maxLength={80} />
      <Field
        label="Description"
        multiline
        value={description}
        onChangeText={setDescription}
        maxLength={500}
      />
      <Heading>Choose a color</Heading>
      <View style={styles.row}>
        {(['coral', 'sage', 'peach'] as const).map((value) => (
          <Button
            key={value}
            title={`${accent === value ? '✓ ' : ''}${value}`}
            secondary={accent !== value}
            onPress={() => setAccent(value)}
          />
        ))}
      </View>
      <ErrorNote error={task.error} />
      <Button
        title={task.busy ? 'Saving…' : 'Save board'}
        disabled={!name.trim() || task.busy}
        onPress={() =>
          void task.run(async () => {
            const fields = { name, description, accent };
            if (initial) {
              await update({ boardId: initial._id, ...fields });
              onDone(initial._id);
            } else onDone(await create(fields));
          })
        }
      />
    </Page>
  );
}
export function JoinScreen({ route, navigation }: ScreenProps<'Join'>) {
  const [input, setInput] = useState(route.params?.token ?? '');
  const [sent, setSent] = useState('');
  const request = useMutation(api.boards.requestToJoin);
  const task = useTask();
  return (
    <Page>
      <Title>A seat at the table.</Title>
      <Text style={styles.body}>
        Paste an invitation link or board code. A board admin will approve your request.
      </Text>
      <Field
        label="Invite link or code"
        autoCapitalize="none"
        autoCorrect={false}
        value={input}
        onChangeText={setInput}
      />
      <ErrorNote error={task.error} />
      {!!sent && (
        <Text accessibilityLiveRegion="polite" style={styles.body}>
          {sent}
        </Text>
      )}
      <Button
        title={task.busy ? 'Sending…' : 'Request to join'}
        disabled={!input.trim() || task.busy || !!sent}
        onPress={() =>
          void task.run(async () => {
            let code = input.trim();
            try {
              const link = new URL(code);
              code = decodeURIComponent(link.pathname.split('/').filter(Boolean).pop() ?? '');
            } catch {
              /* A plain invite code is also accepted. */
            }
            const result = await request({ code });
            if (result.status === 'already_member')
              navigation.replace('Board', { boardId: result.boardId });
            else setSent(`Request sent to ${result.boardName}. Waiting for admin approval.`);
          })
        }
      />
    </Page>
  );
}
export function AccountScreen() {
  const me = useQuery(api.boards.me);
  const update = useMutation(api.boards.updateProfile);
  const { signOut } = useAuthActions();
  const task = useTask();
  const [name, setName] = useState<string>();
  return (
    <Page>
      <Title>Your account</Title>
      <Text style={styles.muted}>Your profile is shared with the people on your boards.</Text>
      <Card>
        <View style={styles.row}>
          <Avatar name={me?.name} image={me?.image} size={64} />
          <View style={{ flex: 1, gap: 4 }}>
            <Heading>{me?.name ?? 'Your profile'}</Heading>
            <Text style={styles.muted}>Your shared journal profile</Text>
          </View>
        </View>
        <Field
          label="Display name"
          value={name ?? me?.name ?? ''}
          onChangeText={setName}
          maxLength={80}
        />
        <ErrorNote error={task.error} />
        <Button
          title={task.busy ? 'Saving…' : 'Save name'}
          disabled={task.busy || !(name ?? me?.name)?.trim()}
          onPress={() =>
            void task.run(async () => {
              await update({ name: name ?? me?.name ?? '' });
              setName(undefined);
            })
          }
        />
      </Card>
      <Button
        secondary
        title="Sign out"
        disabled={task.busy}
        onPress={() =>
          void task.run(async () => {
            await signOut();
            await clearNativeGoogleSession().catch(() => undefined);
          })
        }
      />
    </Page>
  );
}
