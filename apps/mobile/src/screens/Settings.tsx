import { useEffect, useState } from 'react';
import { Share, Switch, Text, View } from 'react-native';
import { useMutation, useQuery } from 'convex/react';
import { api } from '@nico-notes/backend/api';
import type { Doc, Id } from '@nico-notes/backend/dataModel';
import type { ScreenProps } from '../navigation';
import {
  Button,
  Card,
  confirm,
  ErrorNote,
  Field,
  Heading,
  Loading,
  Page,
  styles,
  Title,
  useTask,
} from '../ui';

export function SettingsScreen({ route, navigation }: ScreenProps<'Settings'>) {
  const { boardId } = route.params;
  const data = useQuery(api.boards.get, { boardId });
  const me = useQuery(api.boards.me);
  const requests = useQuery(api.boards.pendingRequests, data?.isAdmin ? { boardId } : 'skip');
  const invitations = useQuery(api.boards.invitations, { boardId });
  const ensureCode = useMutation(api.boards.ensureInviteCode);
  const regenerate = useMutation(api.boards.regenerateInviteCode);
  const createInvitation = useMutation(api.boards.createInvitation);
  const revoke = useMutation(api.boards.revokeInvitation);
  const accept = useMutation(api.boards.acceptRequest);
  const reject = useMutation(api.boards.rejectRequest);
  const setRole = useMutation(api.boards.setMemberRole);
  const removeMember = useMutation(api.boards.removeMember);
  const storage = useMutation(api.photos.setStorage);
  const leave = useMutation(api.boards.leave);
  const remove = useMutation(api.boards.remove);
  const task = useTask();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(interval);
  }, []);
  if (!data) return <Loading />;
  return (
    <Page>
      <Title>{data.board.name}</Title>
      {data.isAdmin && (
        <Button
          secondary
          title="Edit board details"
          onPress={() => navigation.navigate('BoardForm', { boardId })}
        />
      )}
      <Card>
        <Heading>Invite your people</Heading>
        <Text selectable style={styles.body}>
          {data.board.inviteCode ?? 'Create an invite code to share this board.'}
        </Text>
        <Button
          title="Share invite code"
          disabled={task.busy}
          onPress={() =>
            void task.run(async () => {
              const code = await ensureCode({ boardId });
              await Share.share({
                message: `Join ${data.board.name} on nico notes. Board code: ${code}`,
              });
            })
          }
        />
        <Button
          secondary
          title="Share invitation link"
          disabled={task.busy}
          onPress={() =>
            void task.run(async () => {
              const invitation = await createInvitation({ boardId });
              await Share.share({
                message: `Join ${data.board.name} on nico notes: niconotes://invite/${invitation.token}\nWeb: ${(process.env.EXPO_PUBLIC_WEB_URL || 'https://notes.nishitnagar.com').replace(/\/$/, '')}/invite/${invitation.token}`,
              });
            })
          }
        />
        {data.isAdmin && (
          <Button
            title="Regenerate board code"
            secondary
            disabled={task.busy}
            onPress={() =>
              confirm(
                'Replace the board invite code?',
                () => void task.run(() => regenerate({ boardId })),
              )
            }
          />
        )}
        {invitations
          ?.filter((invite) => !invite.revoked && invite.expiresAt > now)
          .map((invite) => (
            <View key={invite._id} style={{ gap: 8 }}>
              <Text style={styles.muted}>
                Link expires {new Date(invite.expiresAt).toLocaleDateString()}
              </Text>
              <Button
                secondary
                title="Revoke invitation link"
                disabled={task.busy}
                onPress={() =>
                  confirm(
                    'Revoke this invitation?',
                    () => void task.run(() => revoke({ invitationId: invite._id })),
                  )
                }
              />
            </View>
          ))}
      </Card>
      {data.isAdmin && (
        <Card>
          <Heading>Join requests</Heading>
          {requests?.length === 0 && <Text style={styles.muted}>All caught up.</Text>}
          {requests?.map((request) => (
            <View key={request._id} style={{ gap: 10 }}>
              <Text style={styles.body}>{request.userName}</Text>
              <View style={styles.row}>
                <Button
                  title="Approve"
                  disabled={task.busy}
                  onPress={() => void task.run(() => accept({ requestId: request._id }))}
                />
                <Button
                  secondary
                  title="Reject"
                  disabled={task.busy}
                  onPress={() => void task.run(() => reject({ requestId: request._id }))}
                />
              </View>
            </View>
          ))}
        </Card>
      )}
      <Card>
        <Heading>Your people</Heading>
        {data.members.map((person) => (
          <View key={person._id} style={{ gap: 10 }}>
            <Text style={styles.body}>
              {person.name} · {person.role}
            </Text>
            {data.isAdmin && (
              <View style={styles.row}>
                <Button
                  secondary
                  title={person.role === 'admin' ? 'Make member' : 'Make admin'}
                  disabled={task.busy}
                  onPress={() =>
                    void task.run(() =>
                      setRole({
                        boardId,
                        userId: person._id,
                        role: person.role === 'admin' ? 'member' : 'admin',
                      }),
                    )
                  }
                />
                {person._id !== me?._id && (
                  <Button
                    secondary
                    title="Remove member"
                    disabled={task.busy}
                    onPress={() =>
                      confirm(
                        `Remove ${person.name} from this board?`,
                        () => void task.run(() => removeMember({ boardId, userId: person._id })),
                      )
                    }
                  />
                )}
              </View>
            )}
          </View>
        ))}
      </Card>
      <Heading>Visit types</Heading>
      {data.types.map((type) => (
        <TypeForm key={type._id} boardId={boardId} initial={type} isAdmin={data.isAdmin} />
      ))}
      <TypeForm boardId={boardId} isAdmin={data.isAdmin} />
      {data.isAdmin && (
        <Card>
          <Heading>Photo storage</Heading>
          <Text style={styles.muted}>
            Store new pictures in {data.board.photoStorage === 'local' ? 'the Mac mini' : 'Convex'}.
            Existing photos keep their original storage.
          </Text>
          <View style={styles.row}>
            {(['convex', 'local'] as const).map((provider) => (
              <Button
                key={provider}
                title={provider === 'convex' ? 'Convex' : 'Mac mini'}
                secondary={(data.board.photoStorage ?? 'convex') !== provider}
                disabled={task.busy}
                onPress={() => void task.run(() => storage({ boardId, provider }))}
              />
            ))}
          </View>
        </Card>
      )}
      <ErrorNote error={task.error} />
      <Button
        secondary
        title="Leave board"
        disabled={task.busy}
        onPress={() =>
          confirm(
            'Leave this board?',
            () =>
              void task.run(async () => {
                await leave({ boardId });
                navigation.popToTop();
              }),
          )
        }
      />
      {data.isAdmin && (
        <Button
          secondary
          title="Delete board"
          disabled={task.busy}
          onPress={() =>
            confirm(
              'Delete this board and all visits?',
              () =>
                void task.run(async () => {
                  await remove({ boardId });
                  navigation.popToTop();
                }),
            )
          }
        />
      )}
    </Page>
  );
}
function TypeForm({
  boardId,
  initial,
  isAdmin,
}: {
  boardId: Id<'boards'>;
  initial?: Doc<'visitTypes'>;
  isAdmin: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(initial?.name ?? '');
  const [categories, setCategories] = useState(initial?.categories.join(', ') ?? '');
  const [showDishes, setShowDishes] = useState(initial?.showDishes ?? true);
  const save = useMutation(api.visitTypes.save);
  const remove = useMutation(api.visitTypes.remove);
  const task = useTask();
  if (!open)
    return (
      <Card>
        <Heading>{initial?.name ?? 'New visit type'}</Heading>
        {initial && (
          <Text style={styles.muted}>
            {initial.categories.join(', ') || 'No preset categories'}
          </Text>
        )}
        <Button
          secondary
          title={initial ? 'Edit type' : 'Add type'}
          onPress={() => setOpen(true)}
        />
      </Card>
    );
  return (
    <Card>
      <Field label="Type name" value={name} onChangeText={setName} maxLength={50} />
      <Field
        label="Categories (comma separated)"
        value={categories}
        onChangeText={setCategories}
        multiline
      />
      <View style={styles.row}>
        <Text style={styles.body}>Track dishes</Text>
        <Switch value={showDishes} onValueChange={setShowDishes} />
      </View>
      <ErrorNote error={task.error} />
      <Button
        title="Save type"
        disabled={task.busy || !name.trim()}
        onPress={() =>
          void task.run(async () => {
            await save({
              boardId,
              id: initial?._id,
              name,
              categories: categories
                .split(',')
                .map((value) => value.trim())
                .filter(Boolean),
              showDishes,
            });
            setOpen(false);
            if (!initial) {
              setName('');
              setCategories('');
            }
          })
        }
      />
      <Button secondary title="Cancel" disabled={task.busy} onPress={() => setOpen(false)} />
      {initial && isAdmin && (
        <Button
          secondary
          title="Delete type"
          disabled={task.busy}
          onPress={() =>
            confirm(
              'Delete this visit type?',
              () => void task.run(() => remove({ id: initial._id })),
            )
          }
        />
      )}
    </Card>
  );
}
