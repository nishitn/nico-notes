import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Icon } from 'react-native-paper';
import type { FunctionReturnType } from 'convex/server';
import type { Doc, Id } from '@nico-notes/backend/dataModel';
import type { api } from '@nico-notes/backend/api';
import { colors } from './ui';
import { VisitCarousel } from './VisitCarousel';

type Summary = FunctionReturnType<typeof api.visits.list>['page'][number];
type Visit = Doc<'visits'> & Partial<Omit<Summary, keyof Doc<'visits'>>>;
type Member = { _id: Id<'users'>; name?: string; image?: string };

function ordinal(n: number) {
  const suffix =
    n % 100 >= 11 && n % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] ?? 'th');
  return `${n}${suffix} Visit`;
}

function formatDate(value: string) {
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function findMemberForRating(
  rating: { userId?: Id<'users'>; importedName?: string },
  members: Member[],
): Member | undefined {
  if (rating.userId) {
    const found = members.find((m) => m._id === rating.userId);
    if (found) return found;
  }
  if (rating.importedName) {
    const raw = rating.importedName.trim().toLowerCase();
    return members.find((m) => {
      if (!m.name) return false;
      const mName = m.name.trim().toLowerCase();
      if (mName === raw || mName.startsWith(raw)) return true;
      const initials = mName
        .split(/\s+/)
        .map((p) => p[0])
        .slice(0, 2)
        .join('')
        .toLowerCase();
      return initials === raw;
    });
  }
  return undefined;
}

function getRatingInitials(
  rating: { userId?: Id<'users'>; importedName?: string },
  member?: Member,
): string {
  const name = member?.name || rating.importedName;
  if (!name) return '?';
  return (
    name
      .trim()
      .split(/\s+/)
      .map((p) => p[0])
      .slice(0, 2)
      .join('')
      .toUpperCase() || '?'
  );
}

export function VisitCard({
  visit,
  onPress,
  members = [],
  number,
}: {
  visit: Visit;
  onPress: () => void;
  members?: Member[];
  number?: number;
}) {
  const score = visit.overall ?? visit.dishAverage;
  const photos = visit.photoIds ?? (visit.photoId ? [visit.photoId] : []);

  return (
    <View style={card.container}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Open ${visit.title}`}
        onPress={onPress}
        style={card.headerPressable}
      >
        <View style={card.eyebrowRow}>
          <Text style={card.visitLabel}>
            {number === undefined ? 'VISIT NOTES' : `Visit #${number}`}
          </Text>
          <Text style={card.date}>{visit.date ? formatDate(visit.date) : 'Undated'}</Text>
        </View>

        <View style={card.titleRow}>
          <Text accessibilityRole="header" style={card.title} numberOfLines={2}>
            {visit.title}
          </Text>
          {score != null && (
            <View style={card.score}>
              <Icon source="heart" size={11} color={colors.rust} />
              <Text style={card.scoreText}>
                {score.toFixed(1)}
                <Text style={card.outOf}>/10</Text>
              </Text>
            </View>
          )}
        </View>

        <View style={card.locationRow}>
          <View style={card.locationContent}>
            <Icon source="map-marker-outline" size={14} color={colors.muted} />
            <Text numberOfLines={1} ellipsizeMode="tail" style={card.locationText}>
              {visit.place || 'Location not recorded'}
              {visit.typeName ? ` · ${visit.typeName}` : ''}
            </Text>
          </View>
          {!!visit.visitNumber && (
            <View style={[card.badge, visit.visitNumber === 1 && card.firstVisit]}>
              <Text style={[card.badgeText, visit.visitNumber === 1 && card.firstVisitText]}>
                {ordinal(visit.visitNumber)}
              </Text>
            </View>
          )}
        </View>
      </Pressable>

      {photos.length > 0 ? (
        <VisitCarousel photos={photos} title={visit.title} onPress={onPress} />
      ) : visit.dishes?.length ? (
        <View style={card.dishesList}>
          {visit.dishes.slice(0, 4).map((dish, index) => (
            <View key={dish._id} style={[card.dishRow, index > 0 && card.dishRowBorder]}>
              <Icon source="silverware-fork-knife" size={13} color={colors.muted} />
              <Text numberOfLines={1} style={card.dishName}>
                {dish.name}
              </Text>
              <View style={card.dishRatingsRow}>
                {members.length <= 4 && dish.ratings.length > 0 ? (
                  dish.ratings.map((rating, i) => {
                    const member = findMemberForRating(rating, members);
                    const initials = getRatingInitials(rating, member);
                    return (
                      <View key={i} style={card.ratingItem}>
                        {member?.image ? (
                          <Image
                            source={{ uri: member.image }}
                            style={card.ratingAvatar}
                            contentFit="cover"
                          />
                        ) : (
                          <View style={card.ratingAvatarFallback}>
                            <Text style={card.ratingInitials}>{initials}</Text>
                          </View>
                        )}
                        <Text style={card.dishScore}>{rating.score.toFixed(1)}</Text>
                      </View>
                    );
                  })
                ) : dish.score != null ? (
                  <Text style={card.dishScore}>{dish.score.toFixed(1)}</Text>
                ) : null}
              </View>
            </View>
          ))}
        </View>
      ) : visit.highlights?.length ? (
        <Text numberOfLines={1} ellipsizeMode="tail" style={card.highlights}>
          {visit.highlights.slice(0, 4).join(' · ')}
        </Text>
      ) : (
        !!visit.notes && (
          <Text numberOfLines={3} style={card.notes}>
            “{visit.notes}”
          </Text>
        )
      )}

      {photos.length > 0 && !!visit.highlights?.length && (
        <Text numberOfLines={1} ellipsizeMode="tail" style={card.highlights}>
          {visit.highlights.slice(0, 3).join(' · ')}
        </Text>
      )}

      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`View notes for ${visit.title}`}
        style={card.footer}
      >
        <Text style={card.footerLink}>View notes</Text>
        <Icon source="arrow-right" size={15} color={colors.rust} />
      </Pressable>
    </View>
  );
}

const card = StyleSheet.create({
  container: {
    backgroundColor: '#FFFEFC',
    borderWidth: 1,
    borderColor: '#EBDCD0',
    borderRadius: 20,
    padding: 16,
    gap: 11,
  },
  headerPressable: {
    gap: 8,
  },
  eyebrowRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  visitLabel: {
    fontFamily: 'JakartaSemiBold',
    fontSize: 11,
    color: colors.rust,
  },
  date: {
    fontFamily: 'Jakarta',
    fontSize: 11,
    color: colors.muted,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  title: {
    fontFamily: 'EpilogueSemiBold',
    fontSize: 18,
    lineHeight: 24,
    letterSpacing: -0.4,
    color: colors.ink,
    flex: 1,
  },
  score: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    borderWidth: 1,
    borderColor: '#F2D4C9',
    backgroundColor: '#FAE9E2',
    borderRadius: 16,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  scoreText: {
    fontFamily: 'JakartaSemiBold',
    fontSize: 12,
    color: colors.rust,
  },
  outOf: {
    fontFamily: 'Jakarta',
    fontSize: 10,
    color: colors.rust,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  locationContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flex: 1,
    minWidth: 0,
  },
  locationText: {
    fontFamily: 'Jakarta',
    fontSize: 12,
    color: colors.muted,
    flex: 1,
  },
  badge: {
    borderWidth: 1,
    borderColor: '#DCD1C4',
    backgroundColor: '#F5EFE6',
    borderRadius: 12,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  badgeText: {
    fontFamily: 'JakartaSemiBold',
    fontSize: 10,
    color: colors.muted,
  },
  firstVisit: {
    backgroundColor: '#E6EFDF',
    borderColor: '#D8E2D4',
  },
  firstVisitText: {
    color: '#3F5934',
  },
  dishesList: {
    paddingVertical: 2,
  },
  dishRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingVertical: 6,
  },
  dishRowBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: '#EEE5DB',
  },
  dishName: {
    fontFamily: 'Jakarta',
    fontSize: 13,
    color: colors.ink,
    flex: 1,
  },
  dishRatingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  ratingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  ratingAvatar: {
    width: 18,
    height: 18,
    borderRadius: 9,
  },
  ratingAvatarFallback: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#F8E8DF',
    borderWidth: 1,
    borderColor: '#F1D5C6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ratingInitials: {
    fontFamily: 'JakartaSemiBold',
    fontSize: 9,
    lineHeight: 11,
    color: colors.rust,
  },
  dishScore: {
    fontFamily: 'JakartaSemiBold',
    fontSize: 12,
    color: colors.rust,
  },
  highlights: {
    fontFamily: 'Jakarta',
    fontSize: 12,
    color: colors.muted,
  },
  notes: {
    fontFamily: 'Jakarta',
    fontSize: 13,
    lineHeight: 19,
    color: colors.muted,
    fontStyle: 'italic',
  },
  footer: {
    borderTopWidth: 1,
    borderColor: '#F2EBE3',
    paddingTop: 9,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 5,
  },
  footerLink: {
    fontFamily: 'JakartaSemiBold',
    fontSize: 12,
    color: colors.rust,
  },
});
