import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useQuery } from 'convex/react';
import { Icon } from 'react-native-paper';
import { api } from '@nico-notes/backend/api';
import type { ScreenProps } from '../navigation';
import { Avatar, Button, Card, colors, Loading, Page, styles, Title } from '../ui';

export function YourBoardsScreen({ navigation }: ScreenProps<'YourBoards'>) {
  const summaries = useQuery(api.boards.summaries);

  if (!summaries) return <Loading />;

  return (
    <Page>
      <Title>Your boards</Title>
      <Text style={styles.muted}>Every shared journal you’re a part of.</Text>

      <View style={{ gap: 14 }}>
        {summaries.map((board) => (
          <Pressable
            key={board._id}
            onPress={() => {
              navigation.replace('Board', { boardId: board._id });
            }}
          >
            <Card style={boardCard.card}>
              <View style={boardCard.header}>
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={boardCard.title}>{board.name}</Text>
                  {!!board.description && (
                    <Text numberOfLines={2} style={styles.muted}>
                      {board.description}
                    </Text>
                  )}
                </View>
                <Icon source="chevron-right" size={20} color={colors.rust} />
              </View>

              <View style={boardCard.statsRow}>
                <View style={boardCard.stat}>
                  <Icon source="book-open-outline" size={16} color={colors.rust} />
                  <Text style={boardCard.statText}>
                    {board.visitCount} {board.visitCount === 1 ? 'visit' : 'visits'}
                  </Text>
                </View>
                <View style={boardCard.stat}>
                  <Icon source="account-group-outline" size={16} color={colors.rust} />
                  <Text style={boardCard.statText}>
                    {board.memberCount} {board.memberCount === 1 ? 'member' : 'members'}
                  </Text>
                </View>
              </View>

              {board.members.length > 0 && (
                <View style={boardCard.membersRow}>
                  <View style={boardCard.avatars}>
                    {board.members.map((member, i) => (
                      <View
                        key={member._id}
                        style={[boardCard.avatarWrapper, { marginLeft: i ? -8 : 0 }]}
                      >
                        <Avatar name={member.name} image={member.image} size={28} />
                      </View>
                    ))}
                  </View>
                  <Text numberOfLines={1} style={boardCard.memberNames}>
                    {board.members.map((m) => m.name || 'Member').join(', ')}
                  </Text>
                </View>
              )}
            </Card>
          </Pressable>
        ))}

        {summaries.length === 0 && (
          <Card>
            <Text style={styles.muted}>You haven’t joined any boards yet.</Text>
          </Card>
        )}
      </View>

      <View style={styles.row}>
        <Button title="New board" onPress={() => navigation.navigate('BoardForm')} />
        <Button secondary title="Join board" onPress={() => navigation.navigate('Join')} />
      </View>
    </Page>
  );
}

const boardCard = StyleSheet.create({
  card: { gap: 12 },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  title: {
    fontFamily: 'EpilogueSemiBold',
    fontSize: 18,
    lineHeight: 24,
    color: colors.ink,
    letterSpacing: -0.4,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingTop: 4,
  },
  stat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statText: {
    fontFamily: 'JakartaSemiBold',
    fontSize: 13,
    color: colors.rust,
  },
  membersRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  avatars: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarWrapper: {
    borderRadius: 14,
    borderWidth: 2,
    borderColor: colors.paper,
  },
  memberNames: {
    fontFamily: 'Jakarta',
    fontSize: 12,
    color: colors.muted,
    flex: 1,
  },
});
