import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Button as MaterialButton, Dialog, Icon, IconButton, Portal } from 'react-native-paper';
import { useMutation, usePaginatedQuery, useQuery } from '../convexLive';
import { api } from '@nico-notes/backend/api';
import type { Doc, Id } from '@nico-notes/backend/dataModel';
import type { ScreenProps } from '../navigation';
import { colors, Button, ErrorNote, Field, Loading, Page, styles, Title, useTask } from '../ui';
import { PlaceTopBar } from './Places';
import { AccountTools } from '../ReleaseTools';
import { ProfilePhoto } from '../ProfilePhoto';
import { useUnsavedChanges } from '../useUnsavedChanges';

export { VisitCard } from '../VisitCard';
export function BoardFormScreen({ route, navigation }: ScreenProps<'BoardForm'>) {
  const boardId = route.params?.boardId;
  const data = useQuery(api.boards.get, boardId ? { boardId } : 'skip');
  const boards = usePaginatedQuery(api.boards.list, {}, { initialNumItems: 24 });
  return (
    <View style={styles.page}>
      <PlaceTopBar
        navigation={navigation}
        boardId={boardId}
        boardName={data?.board.name}
        boards={boards}
      />
      {boardId && !data ? (
        <Loading />
      ) : (
        <BoardForm
          key={boardId ?? 'new'}
          initial={data?.board}
          onDone={(id) => {
            if (boardId) navigation.goBack();
            else navigation.replace('Board', { boardId: id });
          }}
        />
      )}
    </View>
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
  const create = useMutation(api.boards.create);
  const update = useMutation(api.boards.update);
  const task = useTask();
  const dirty = name !== (initial?.name ?? '') || description !== (initial?.description ?? '');
  const allowExit = useUnsavedChanges(dirty, task.busy);
  const save = () =>
    void task.run(async () => {
      const fields = { name, description, accent: initial?.accent ?? ('coral' as const) };
      if (initial) {
        await update({ boardId: initial._id, ...fields });
        allowExit();
        onDone(initial._id);
      } else {
        const id = await create(fields);
        allowExit();
        onDone(id);
      }
    });
  return (
    <Page>
      <View style={boardFormStyles.form}>
        <View style={boardFormStyles.heading}>
          <Title style={boardFormStyles.title}>{initial ? 'Board details' : 'New board'}</Title>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={initial ? 'Save board details' : 'Create board'}
            accessibilityState={{ disabled: !name.trim() || task.busy, busy: task.busy }}
            disabled={!name.trim() || task.busy}
            onPress={save}
            style={({ pressed }) => [
              boardFormStyles.save,
              { opacity: !name.trim() || task.busy ? 0.4 : pressed ? 0.6 : 1 },
            ]}
          >
            {task.busy ? (
              <ActivityIndicator size="small" color={colors.rust} />
            ) : (
              <Icon source="check" size={20} color={colors.rust} />
            )}
            <Text style={styles.link}>{initial ? 'Save' : 'Create'}</Text>
          </Pressable>
        </View>
        <Field
          label="Board name"
          value={name}
          onChangeText={setName}
          maxLength={80}
          placeholder="e.g. Our food adventures"
          editable={!task.busy}
          style={boardFormStyles.input}
        />
        <Field
          label="Description (optional)"
          multiline
          value={description}
          onChangeText={setDescription}
          maxLength={500}
          placeholder="What is this board for?"
          editable={!task.busy}
          style={[boardFormStyles.input, boardFormStyles.description]}
        />
        <ErrorNote error={task.error} />
      </View>
    </Page>
  );
}
const boardFormStyles = StyleSheet.create({
  form: { gap: 18 },
  heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  title: { fontSize: 24, lineHeight: 32, flex: 1 },
  save: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    minWidth: 64,
    minHeight: 44,
  },
  input: {
    fontSize: 14,
    minHeight: 44,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
  },
  description: { minHeight: 88 },
});
export function JoinScreen({ route, navigation }: ScreenProps<'Join'>) {
  const [input, setInput] = useState(route.params?.token ?? '');
  const [sentBoard, setSentBoard] = useState<Id<'boards'>>();
  const outcomes = useQuery(api.boards.myOutgoingRequests);
  const outcome = outcomes?.find((item) => item.boardId === sentBoard);
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
      {!!sentBoard && (
        <Text accessibilityLiveRegion="polite" style={styles.body}>
          {outcome?.status === 'accepted'
            ? 'Your request was approved.'
            : outcome?.status === 'rejected'
              ? 'Your request was declined. You can ask the admin for help or request again.'
              : 'Request sent. Waiting for admin approval.'}
        </Text>
      )}
      {outcome?.status === 'accepted' && (
        <Button
          title="Open board"
          onPress={() => navigation.replace('Board', { boardId: outcome.boardId })}
        />
      )}
      <Button
        title={task.busy ? 'Sending…' : 'Request to join'}
        disabled={!input.trim() || task.busy || (!!sentBoard && outcome?.status !== 'rejected')}
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
            else setSentBoard(result.boardId);
          })
        }
      />
    </Page>
  );
}
export function AccountScreen({ navigation }: ScreenProps<'Account'>) {
  const me = useQuery(api.boards.me);
  const [editingName, setEditingName] = useState(false);
  return (
    <View style={styles.page}>
      <PlaceTopBar navigation={navigation} />
      {!me ? (
        <Loading />
      ) : (
        <Page>
          <Title>Your account</Title>
          <View style={{ paddingVertical: 12, marginBottom: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 16 }}>
              <ProfilePhoto name={me.name} image={me.image} />
              <View
                style={{
                  flex: 1,
                  minHeight: 68,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 16,
                }}
              >
                <Text
                  style={{
                    fontFamily: 'EpilogueSemiBold',
                    fontSize: 21,
                    color: colors.ink,
                    flex: 1,
                  }}
                >
                  {me.name}
                </Text>
                <IconButton
                  icon="pencil-outline"
                  iconColor={colors.rust}
                  accessibilityLabel="Edit name"
                  style={{ margin: 0, backgroundColor: colors.coralLight }}
                  onPress={() => setEditingName(true)}
                />
              </View>
            </View>
          </View>
          <AccountTools navigation={navigation} />
          {editingName && <EditProfileName name={me.name} onClose={() => setEditingName(false)} />}
        </Page>
      )}
    </View>
  );
}

function EditProfileName({ name, onClose }: { name: string; onClose: () => void }) {
  const update = useMutation(api.boards.updateProfile);
  const [draft, setDraft] = useState(name);
  const task = useTask();
  const save = () =>
    void task.run(async () => {
      await update({ name: draft });
      onClose();
    });
  return (
    <Portal>
      <Dialog
        visible
        onDismiss={() => !task.busy && onClose()}
        dismissable={!task.busy}
        style={{ backgroundColor: colors.paper }}
      >
        <Dialog.Title>Edit name</Dialog.Title>
        <Dialog.Content style={{ gap: 12 }}>
          <Field
            label="Display name"
            value={draft}
            onChangeText={setDraft}
            maxLength={80}
            autoFocus
            editable={!task.busy}
            onSubmitEditing={() => draft.trim() && !task.busy && save()}
          />
          <ErrorNote error={task.error} />
        </Dialog.Content>
        <Dialog.Actions>
          <MaterialButton textColor={colors.muted} disabled={task.busy} onPress={onClose}>
            Cancel
          </MaterialButton>
          <MaterialButton
            textColor={colors.rust}
            disabled={task.busy || !draft.trim()}
            loading={task.busy}
            onPress={save}
          >
            Save name
          </MaterialButton>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}
