import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { Button as MaterialButton, Dialog, Icon, Menu, Portal } from 'react-native-paper';
import { AccountRow } from './AccountRow';
import { useAuthActions } from '@convex-dev/auth/react';
import { useMutation, usePaginatedQuery, useQuery } from './convexLive';
import { api } from '@nico-notes/backend/api';
import {
  APP_VERSION,
  ACCOUNT_DELETION_NOTICE,
  SUPPORT_EMAIL,
  type LegalPage,
} from '@nico-notes/backend/legal';
import type { ScreenProps } from './navigation';
import {
  Button,
  Card,
  colors,
  ErrorNote,
  Field,
  Loading,
  Page,
  styles,
  Title,
  useTask,
} from './ui';
import { clearNativeGoogleSession } from '../modules/google-sign-in';
import { PlaceTopBar } from './screens/Places';
import { useUnsavedChanges } from './useUnsavedChanges';

const webOrigin = (process.env.EXPO_PUBLIC_WEB_URL || 'https://notes.nishitnagar.com').replace(
  /\/$/,
  '',
);
export function openLegal(page: LegalPage) {
  return Linking.openURL(`${webOrigin}/${page}`);
}

export function AccountTools({ navigation }: Pick<ScreenProps<'Account'>, 'navigation'>) {
  const remove = useMutation(api.account.remove);
  const unblock = useMutation(api.safety.unblock);
  const blocked = useQuery(api.safety.blocked);
  const { signOut } = useAuthActions();
  const [deleting, setDeleting] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const [showBlocked, setShowBlocked] = useState(false);
  const task = useTask();
  const closeDeletion = () => {
    if (!task.busy) {
      setDeleting(false);
      setConfirmation('');
    }
  };
  return (
    <View style={{ gap: 18 }}>
      <Card style={{ padding: 0, gap: 0, overflow: 'hidden' }}>
        <AccountRow label="Help and support" onPress={() => navigation.navigate('Support')} />
      </Card>
      <Card style={{ padding: 0, gap: 0, overflow: 'hidden' }}>
        <AccountRow label="Privacy policy" onPress={() => void openLegal('privacy')} />
        <AccountRow separator label="Terms of use" onPress={() => void openLegal('terms')} />
        {!!blocked?.length && (
          <AccountRow
            separator
            label={`Blocked people · ${blocked.length}`}
            expanded={showBlocked}
            onPress={() => setShowBlocked(!showBlocked)}
          />
        )}
        {showBlocked &&
          blocked?.map((person) => (
            <View key={person._id} style={{ paddingHorizontal: 18, paddingBottom: 12 }}>
              <Button
                secondary
                title={`Unblock ${person.name}`}
                disabled={task.busy}
                onPress={() => void task.run(() => unblock({ userId: person.userId }))}
              />
            </View>
          ))}
      </Card>
      <Card style={{ padding: 0, gap: 0, overflow: 'hidden' }}>
        <AccountRow
          label="Sign out"
          disabled={task.busy}
          onPress={() =>
            void task.run(async () => {
              await signOut();
              await clearNativeGoogleSession().catch(() => undefined);
            })
          }
        />
      </Card>
      {!deleting && <ErrorNote error={task.error} />}
      <View style={{ alignItems: 'center', gap: 4, paddingTop: 2 }}>
        <Pressable
          accessibilityRole="button"
          disabled={task.busy}
          onPress={() => setDeleting(true)}
          style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 16 }}
        >
          <Text style={[styles.muted, { fontSize: 13, textDecorationLine: 'underline' }]}>
            Delete account
          </Text>
        </Pressable>
        <Text style={[styles.muted, { fontSize: 12 }]}>nico notes · {APP_VERSION}</Text>
      </View>
      <Portal>
        <Dialog
          visible={deleting}
          dismissable={!task.busy}
          onDismiss={closeDeletion}
          style={{ backgroundColor: colors.paper }}
        >
          <Dialog.Title>Delete your account?</Dialog.Title>
          <Dialog.Content style={{ gap: 16 }}>
            <Text style={styles.body}>{ACCOUNT_DELETION_NOTICE}</Text>
            <Field
              label="Type DELETE to confirm"
              value={confirmation}
              onChangeText={setConfirmation}
              autoCapitalize="characters"
              autoCorrect={false}
              editable={!task.busy}
            />
            <ErrorNote error={task.error} />
          </Dialog.Content>
          <Dialog.Actions>
            <MaterialButton disabled={task.busy} onPress={closeDeletion}>
              Cancel
            </MaterialButton>
            <MaterialButton
              textColor={colors.rust}
              loading={task.busy}
              disabled={task.busy || confirmation !== 'DELETE'}
              onPress={() =>
                void task.run(async () => {
                  await remove({ confirmation: 'DELETE' });
                  await signOut().catch(() => undefined);
                  await clearNativeGoogleSession().catch(() => undefined);
                })
              }
            >
              Delete account
            </MaterialButton>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </View>
  );
}

export function TermsGate({ version }: { version: string }) {
  const accept = useMutation(api.safety.acceptTerms);
  const { signOut } = useAuthActions();
  const task = useTask();
  return (
    <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 28 }}>
      <View style={{ width: '100%', maxWidth: 380, alignSelf: 'center', gap: 24 }}>
        <Image
          source={require('../../web/public/favicon.svg')}
          style={{ width: 64, height: 64, alignSelf: 'center' }}
          accessible={false}
        />
        <Title style={{ textAlign: 'center' }}>Welcome to nico notes.</Title>
        <Text style={[styles.muted, { textAlign: 'center' }]}>
          By continuing, you agree to our{' '}
          <Text
            accessibilityRole="link"
            style={[styles.link, { textDecorationLine: 'underline' }]}
            onPress={() => void openLegal('terms')}
          >
            Terms
          </Text>
          . {'\n'}Read our{' '}
          <Text
            accessibilityRole="link"
            style={[styles.link, { textDecorationLine: 'underline' }]}
            onPress={() => void openLegal('privacy')}
          >
            Privacy Policy
          </Text>
          .
        </Text>
        <ErrorNote error={task.error} />
        <Button
          title={task.busy ? 'Just a moment…' : 'Agree and continue'}
          disabled={task.busy}
          onPress={() => void task.run(() => accept({ version }))}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: task.busy }}
          disabled={task.busy}
          onPress={() => void task.run(signOut)}
          style={{ minHeight: 48, justifyContent: 'center', alignItems: 'center' }}
        >
          <Text style={styles.link}>Sign out</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

export function SupportScreen() {
  const report = useMutation(api.safety.reportProblem);
  const [description, setDescription] = useState('');
  const [sent, setSent] = useState(false);
  const task = useTask();
  useUnsavedChanges(!sent && !!description.trim(), task.busy);
  return (
    <Page>
      <Title>Help and support</Title>
      <Button
        secondary
        title="Getting started and troubleshooting"
        onPress={() => void openLegal('help')}
      />
      <Text selectable style={styles.body}>
        {SUPPORT_EMAIL}
      </Text>
      <Text style={styles.muted}>
        Version {APP_VERSION}. Please keep passwords, tokens and private pictures out of support
        requests.
      </Text>
      {sent ? (
        <Text accessibilityRole="alert" style={styles.body}>
          Your request was sent to support.
        </Text>
      ) : (
        <>
          <Field
            label="What went wrong?"
            multiline
            value={description}
            onChangeText={setDescription}
            maxLength={2000}
            editable={!task.busy}
          />
          <Button
            title={task.busy ? 'Sending…' : 'Send support request'}
            disabled={task.busy || description.trim().length < 5}
            onPress={() =>
              void task.run(async () => {
                await report({ description, version: APP_VERSION, platform: 'android' });
                setSent(true);
              })
            }
          />
        </>
      )}
      <ErrorNote error={task.error} />
    </Page>
  );
}

export function SafetyScreen({ route, navigation }: ScreenProps<'Safety'>) {
  const { boardId, visitId, photoId } = route.params;
  const board = useQuery(api.boards.get, { boardId });
  const boards = usePaginatedQuery(api.boards.list, {}, { initialNumItems: 24 });
  const me = useQuery(api.boards.me);
  const report = useMutation(api.safety.report);
  const block = useMutation(api.safety.block);
  const [reason, setReason] = useState('');
  const [sent, setSent] = useState(false);
  const [blockMenuOpen, setBlockMenuOpen] = useState(false);
  const task = useTask();
  const allowExit = useUnsavedChanges(!sent && !!reason.trim(), task.busy);
  const people = me ? (board?.members.filter((member) => member._id !== me._id) ?? []) : [];
  return (
    <View style={styles.page}>
      <PlaceTopBar
        navigation={navigation}
        boardId={boardId}
        boardName={board?.board.name}
        boards={boards}
      />
      {!board ? (
        <Loading />
      ) : (
        <Page>
          <View style={safetyStyles.content}>
            <View style={safetyStyles.heading}>
              <Title style={safetyStyles.title}>Safety</Title>
              {!sent && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Send report"
                  accessibilityState={{
                    disabled: task.busy || reason.trim().length < 5,
                    busy: task.busy,
                  }}
                  disabled={task.busy || reason.trim().length < 5}
                  onPress={() =>
                    void task.run(async () => {
                      await report({ boardId, visitId, photoId, reason });
                      setSent(true);
                    })
                  }
                  style={({ pressed }) => [
                    styles.iconButton,
                    { opacity: task.busy || reason.trim().length < 5 ? 0.35 : pressed ? 0.6 : 1 },
                  ]}
                >
                  {task.busy ? (
                    <ActivityIndicator size="small" color={colors.rust} />
                  ) : (
                    <Icon source="send-outline" size={22} color={colors.rust} />
                  )}
                </Pressable>
              )}
            </View>
            {sent ? (
              <Text accessibilityRole="alert" style={styles.body}>
                Report received. A service moderator will review it.
              </Text>
            ) : (
              <>
                <TextInput
                  accessibilityLabel="What happened?"
                  placeholder="What happened? Include the person or content involved."
                  placeholderTextColor={colors.muted}
                  multiline
                  maxLength={2000}
                  value={reason}
                  onChangeText={setReason}
                  editable={!task.busy}
                  style={safetyStyles.textbox}
                />
                <Text style={safetyStyles.help}>Reports are reviewed by service moderators.</Text>
              </>
            )}
            <ErrorNote error={task.error} />
            <View style={safetyStyles.footer}>
              <Pressable
                accessibilityRole="link"
                onPress={() => void Linking.openURL(`mailto:${SUPPORT_EMAIL}`)}
                style={styles.textButton}
              >
                <Icon source="email-outline" size={17} color={colors.muted} />
                <Text style={safetyStyles.link}>Contact support</Text>
              </Pressable>
              {!!people.length && (
                <Menu
                  visible={blockMenuOpen}
                  onDismiss={() => setBlockMenuOpen(false)}
                  anchorPosition="bottom"
                  statusBarHeight={0}
                  contentStyle={safetyStyles.menu}
                  anchor={
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Block a person"
                      accessibilityState={{ expanded: blockMenuOpen, disabled: task.busy }}
                      disabled={task.busy}
                      onPress={() => setBlockMenuOpen(true)}
                      style={styles.textButton}
                    >
                      <Icon source="account-cancel-outline" size={17} color={colors.muted} />
                      <Text style={safetyStyles.link}>Block a person</Text>
                    </Pressable>
                  }
                >
                  {people.map((person) => (
                    <Menu.Item
                      key={person._id}
                      dense
                      title={person.name}
                      leadingIcon="account-cancel-outline"
                      onPress={() => {
                        setBlockMenuOpen(false);
                        Alert.alert(
                          `Block ${person.name}?`,
                          'You will leave boards you share with them and cannot join the same boards while blocked. Your existing contributions remain. Sole-admin boards transfer safely where possible.',
                          [
                            { text: 'Cancel', style: 'cancel' },
                            {
                              text: 'Block and leave',
                              style: 'destructive',
                              onPress: () =>
                                void task.run(async () => {
                                  await block({ boardId, userId: person._id });
                                  allowExit();
                                  navigation.reset({ index: 0, routes: [{ name: 'Boards' }] });
                                }),
                            },
                          ],
                        );
                      }}
                    />
                  ))}
                </Menu>
              )}
            </View>
          </View>
        </Page>
      )}
    </View>
  );
}
const safetyStyles = StyleSheet.create({
  content: { gap: 12 },
  heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  title: { fontSize: 24, lineHeight: 32 },
  textbox: {
    ...styles.input,
    minHeight: 132,
    textAlignVertical: 'top',
    padding: 12,
    fontSize: 14,
    lineHeight: 21,
  },
  help: { fontFamily: 'Jakarta', fontSize: 11, lineHeight: 17, color: colors.muted },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 12,
  },
  link: { fontFamily: 'Jakarta', fontSize: 12, color: colors.muted },
  menu: { backgroundColor: colors.paper, borderRadius: 12, paddingVertical: 4 },
});
