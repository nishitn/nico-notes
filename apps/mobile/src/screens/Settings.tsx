import { useEffect, useState, type ReactNode } from 'react';
import { Pressable, Share, StyleSheet, Switch, Text, View } from 'react-native';
import { Icon, Menu } from 'react-native-paper';
import { useMutation, usePaginatedQuery, useQuery } from '../convexLive';
import { api } from '@nico-notes/backend/api';
import type { Doc, Id } from '@nico-notes/backend/dataModel';
import type { ScreenProps } from '../navigation';
import { PlaceTopBar } from './Places';
import {
  Avatar,
  colors,
  confirm,
  ErrorNote,
  Field,
  Loading,
  Page,
  styles,
  Title,
  useTask,
} from '../ui';

function ActionIcon({
  icon,
  label,
  onPress,
  disabled,
  danger,
}: {
  icon: string;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        settings.iconButton,
        { opacity: disabled ? 0.35 : pressed ? 0.6 : 1 },
      ]}
    >
      <Icon source={icon} size={19} color={danger ? colors.error : colors.rust} />
    </Pressable>
  );
}

function SettingsGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={settings.group}>
      <View style={settings.groupHeading}>
        <Text accessibilityRole="header" style={settings.groupTitle}>
          {title}
        </Text>
      </View>
      {children}
    </View>
  );
}

function SettingsRow({
  title,
  description,
  onPress,
  trailing,
  danger,
  disabled,
}: {
  title: string;
  description?: string;
  onPress?: () => void;
  trailing?: ReactNode;
  danger?: boolean;
  disabled?: boolean;
}) {
  const content = (
    <>
      <View style={settings.rowBody}>
        <Text style={[settings.rowTitle, danger && { color: colors.error }]}>{title}</Text>
        {!!description && <Text style={settings.rowDescription}>{description}</Text>}
      </View>
      {trailing ?? (onPress && <Icon source="chevron-right" size={18} color={colors.muted} />)}
    </>
  );
  return onPress ? (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      accessibilityState={{ disabled: !!disabled }}
      onPress={onPress}
      style={({ pressed }) => [settings.row, (pressed || disabled) && { opacity: 0.55 }]}
    >
      {content}
    </Pressable>
  ) : (
    <View style={settings.row}>{content}</View>
  );
}

function MemberActions({
  name,
  role,
  busy,
  lastAdmin,
  canRemove,
  onRole,
  onRemove,
}: {
  name: string;
  role: string;
  busy: boolean;
  lastAdmin: boolean;
  canRemove: boolean;
  onRole: () => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Menu
      visible={open}
      onDismiss={() => setOpen(false)}
      anchorPosition="bottom"
      statusBarHeight={0}
      contentStyle={settings.menu}
      anchor={
        <ActionIcon
          icon="dots-horizontal"
          label={`Manage ${name}`}
          disabled={busy}
          onPress={() => setOpen(true)}
        />
      }
    >
      <Menu.Item
        dense
        title={role === 'admin' ? 'Make member' : 'Make admin'}
        leadingIcon="shield-account-outline"
        disabled={busy || lastAdmin}
        onPress={() => {
          setOpen(false);
          onRole();
        }}
      />
      {canRemove && (
        <Menu.Item
          dense
          title="Remove member"
          leadingIcon="account-minus-outline"
          disabled={busy || lastAdmin}
          onPress={() => {
            setOpen(false);
            onRemove();
          }}
        />
      )}
    </Menu>
  );
}

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
  const leave = useMutation(api.boards.leave);
  const remove = useMutation(api.boards.remove);
  const task = useTask();
  const boards = usePaginatedQuery(api.boards.list, {}, { initialNumItems: 24 });
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(interval);
  }, []);
  if (!data) return <Loading />;
  const adminCount = data.members.filter((person) => person.role === 'admin').length;
  return (
    <View style={styles.page}>
      <PlaceTopBar
        navigation={navigation}
        boardId={boardId}
        boardName={data.board.name}
        boards={boards}
      />
      <Page>
        <View style={settings.content}>
          <Title style={settings.title}>Board settings</Title>
          <SettingsGroup title="General">
            <SettingsRow
              title={data.board.name}
              description={data.board.description || 'Board details'}
              onPress={
                data.isAdmin ? () => navigation.navigate('BoardForm', { boardId }) : undefined
              }
            />
            <SettingsRow
              title="Safety"
              description="Report or block"
              onPress={() => navigation.navigate('Safety', { boardId })}
            />
          </SettingsGroup>
          <SettingsGroup title={`Members · ${data.members.length}/20`}>
            {data.members.map((person) => (
              <View key={person._id} style={settings.row}>
                <Avatar name={person.name} image={person.image} size={32} />
                <View style={settings.rowBody}>
                  <Text style={settings.rowTitle}>
                    {person.name}
                    {person._id === me?._id ? ' (you)' : ''}
                  </Text>
                  <Text style={settings.rowDescription}>
                    {person.role === 'admin' ? 'Admin' : 'Member'}
                  </Text>
                </View>
                {data.isAdmin && (
                  <MemberActions
                    name={person.name}
                    role={person.role}
                    busy={task.busy}
                    lastAdmin={person.role === 'admin' && adminCount === 1}
                    canRemove={person._id !== me?._id}
                    onRole={() =>
                      void task.run(() =>
                        setRole({
                          boardId,
                          userId: person._id,
                          role: person.role === 'admin' ? 'member' : 'admin',
                        }),
                      )
                    }
                    onRemove={() =>
                      confirm(
                        `Remove ${person.name} from this board?`,
                        () => void task.run(() => removeMember({ boardId, userId: person._id })),
                      )
                    }
                  />
                )}
              </View>
            ))}
            {data.isAdmin && !!requests?.length && (
              <>
                <Text style={settings.subheading}>Join requests · {requests.length}</Text>
                {requests.map((request) => (
                  <SettingsRow
                    key={request._id}
                    title={request.userName}
                    trailing={
                      <View style={settings.actions}>
                        <ActionIcon
                          icon="check"
                          label={`Approve ${request.userName}`}
                          disabled={task.busy}
                          onPress={() => void task.run(() => accept({ requestId: request._id }))}
                        />
                        <ActionIcon
                          icon="close"
                          label={`Reject ${request.userName}`}
                          disabled={task.busy}
                          onPress={() => void task.run(() => reject({ requestId: request._id }))}
                        />
                      </View>
                    }
                  />
                ))}
              </>
            )}
          </SettingsGroup>
          <SettingsGroup title="Invitations">
            <SettingsRow
              title="Invite code"
              description={data.board.inviteCode || 'Share a code to invite someone'}
              trailing={
                <View style={settings.actions}>
                  <ActionIcon
                    icon="share-variant-outline"
                    label="Share invite code"
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
                  {data.isAdmin && (
                    <ActionIcon
                      icon="refresh"
                      label="Regenerate board code"
                      disabled={task.busy}
                      onPress={() =>
                        confirm(
                          'Replace the board invite code?',
                          () => void task.run(() => regenerate({ boardId })),
                        )
                      }
                    />
                  )}
                </View>
              }
            />
            <SettingsRow
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
              trailing={<Icon source="share-variant-outline" size={19} color={colors.rust} />}
            />
            {invitations
              ?.filter((invite) => !invite.revoked && invite.expiresAt > now)
              .map((invite) => (
                <SettingsRow
                  key={invite._id}
                  title="Active invitation"
                  description={`Expires ${new Date(invite.expiresAt).toLocaleDateString()}`}
                  trailing={
                    data.isAdmin && (
                      <ActionIcon
                        icon="link-variant-off"
                        label="Revoke invitation link"
                        disabled={task.busy}
                        onPress={() =>
                          confirm(
                            'Revoke this invitation?',
                            () => void task.run(() => revoke({ invitationId: invite._id })),
                          )
                        }
                      />
                    )
                  }
                />
              ))}
          </SettingsGroup>
          <SettingsGroup title="Visit types">
            {data.types.map((type) => (
              <TypeForm key={type._id} boardId={boardId} initial={type} isAdmin={data.isAdmin} />
            ))}
            {data.types.length < 50 && <TypeForm boardId={boardId} isAdmin={data.isAdmin} />}
          </SettingsGroup>
          <ErrorNote error={task.error} />
          <View style={settings.exitSection}>
            <SettingsRow
              title="Leave board"
              danger
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
              <SettingsRow
                title="Delete board"
                danger
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
          </View>
        </View>
      </Page>
    </View>
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
      <SettingsRow
        title={initial?.name ?? 'Add visit type'}
        description={
          initial
            ? `${initial.categories.join(' · ') || 'No preset categories'}${initial.showDishes ? ' · Dishes' : ''}`
            : undefined
        }
        onPress={() => setOpen(true)}
        trailing={
          <Icon source={initial ? 'pencil-outline' : 'plus'} size={18} color={colors.rust} />
        }
      />
    );
  return (
    <View style={settings.typeEditor}>
      <View style={settings.editorHeading}>
        <Text style={settings.rowTitle}>{initial ? 'Edit visit type' : 'New visit type'}</Text>
        <View style={settings.actions}>
          {initial && isAdmin && (
            <ActionIcon
              icon="trash-can-outline"
              label={`Delete ${initial.name} type`}
              danger
              disabled={task.busy}
              onPress={() =>
                confirm(
                  'Delete this visit type?',
                  () => void task.run(() => remove({ id: initial._id })),
                )
              }
            />
          )}
          <ActionIcon
            icon="close"
            label="Cancel editing type"
            disabled={task.busy}
            onPress={() => setOpen(false)}
          />
          <ActionIcon
            icon="check"
            label="Save visit type"
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
        </View>
      </View>
      <Field label="Type name" value={name} onChangeText={setName} maxLength={50} />
      <Field
        label="Categories (comma separated)"
        value={categories}
        onChangeText={setCategories}
        multiline
      />
      <View style={settings.editorHeading}>
        <Text style={settings.rowTitle}>Track dishes</Text>
        <Switch
          accessibilityLabel="Track dishes"
          value={showDishes}
          onValueChange={setShowDishes}
          disabled={task.busy}
        />
      </View>
      <ErrorNote error={task.error} />
    </View>
  );
}

const settings = StyleSheet.create({
  content: { gap: 20 },
  title: { fontSize: 25, lineHeight: 32 },
  group: { gap: 0 },
  groupHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingBottom: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  groupTitle: {
    fontFamily: 'JakartaSemiBold',
    fontSize: 11,
    letterSpacing: 0.7,
    color: colors.muted,
    textTransform: 'uppercase',
  },
  subheading: { ...styles.eyebrow, marginTop: 12, marginBottom: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, paddingVertical: 6 },
  rowBody: { flex: 1, minWidth: 0, gap: 2 },
  rowTitle: { fontFamily: 'JakartaSemiBold', fontSize: 13, lineHeight: 19, color: colors.ink },
  rowDescription: { fontFamily: 'Jakarta', fontSize: 11, lineHeight: 16, color: colors.muted },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  actions: { flexDirection: 'row', alignItems: 'center' },
  menu: { backgroundColor: colors.paper, borderRadius: 12, paddingVertical: 4 },
  exitSection: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: 8,
  },
  typeEditor: { paddingVertical: 10, gap: 12 },
  editorHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
});
