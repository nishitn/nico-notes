import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Icon } from 'react-native-paper';
import type { FunctionReturnType } from 'convex/server';
import type { Doc, Id } from '@nico-notes/backend/dataModel';
import type { api } from '@nico-notes/backend/api';
import { colors, styles } from './ui';
import { Photo } from './photos';

type Summary = FunctionReturnType<typeof api.visits.list>['page'][number];
type Visit = Doc<'visits'> & Partial<Omit<Summary, keyof Doc<'visits'>>>;
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
export function VisitCard({
  visit,
  onPress,
  members = [],
  number,
}: {
  visit: Visit;
  onPress: () => void;
  members?: { _id: Id<'users'>; name?: string }[];
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
        style={{ gap: 12 }}
      >
        <View style={styles.sectionRow}>
          <Text style={card.visitLabel}>
            {number === undefined ? 'VISIT NOTES' : `Visit #${number}`}
          </Text>
          <Text style={card.date}>{visit.date ? formatDate(visit.date) : 'Undated'}</Text>
        </View>
        <View style={card.titleRow}>
          <Text accessibilityRole="header" style={card.title}>
            {visit.title}
          </Text>
          <View style={card.meta}>
            {score != null && (
              <View style={card.score}>
                <Icon source="heart" size={12} color={colors.rust} />
                <Text style={card.scoreText}>
                  {score.toFixed(1)}
                  <Text style={card.outOf}> /10</Text>
                </Text>
              </View>
            )}
            {!!visit.visitNumber && (
              <Text style={[card.badge, visit.visitNumber === 1 && card.firstVisit]}>
                {ordinal(visit.visitNumber)}
              </Text>
            )}
          </View>
        </View>
        <View style={card.location}>
          <Icon source="map-marker-outline" size={15} color={colors.muted} />
          <Text numberOfLines={2} style={[styles.muted, { flex: 1, fontSize: 12 }]}>
            {visit.place || 'Location not recorded'}
            {visit.typeName ? ` · ${visit.typeName}` : ''}
          </Text>
        </View>
      </Pressable>
      {photos.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 10 }}
          nestedScrollEnabled
        >
          {photos.map((id) => (
            <Pressable
              key={id}
              onPress={onPress}
              accessibilityRole="button"
              accessibilityLabel={`Open photos for ${visit.title}`}
              style={{ width: photos.length === 1 ? 280 : 210 }}
            >
              <Photo id={id} alt={visit.title} />
            </Pressable>
          ))}
        </ScrollView>
      ) : visit.dishes?.length ? (
        <View style={card.dishes}>
          {visit.dishes.slice(0, 4).map((dish) => (
            <View key={dish._id} style={card.dishRow}>
              <Icon source="silverware-fork-knife" size={14} color={colors.muted} />
              <Text style={[styles.muted, { flex: 1, color: colors.ink }]}>{dish.name}</Text>
              {members.length <= 3 &&
                (dish.ratings.length
                  ? dish.ratings.map((rating, i) => {
                      const name =
                        rating.importedName || members.find((m) => m._id === rating.userId)?.name;
                      return (
                        <Text key={i} style={card.dishScore}>
                          {name
                            ?.trim()
                            .split(/\s+/)
                            .map((p) => p[0])
                            .slice(0, 2)
                            .join('')}{' '}
                          {rating.score.toFixed(1)}
                        </Text>
                      );
                    })
                  : dish.score != null && (
                      <Text style={card.dishScore}>{dish.score.toFixed(1)}</Text>
                    ))}
            </View>
          ))}
        </View>
      ) : visit.highlights?.length ? (
        <Text style={styles.muted}>{visit.highlights.slice(0, 4).join(' · ')}</Text>
      ) : (
        !!visit.notes && (
          <Text numberOfLines={4} style={card.notes}>
            “{visit.notes}”
          </Text>
        )
      )}
      {photos.length > 0 && !!visit.highlights?.length && (
        <Text style={styles.muted}>{visit.highlights.slice(0, 2).join(' · ')}</Text>
      )}
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`View notes for ${visit.title}`}
        style={card.footer}
      >
        <Text style={styles.link}>View notes</Text>
        <Icon source="arrow-right" size={17} color={colors.rust} />
      </Pressable>
    </View>
  );
}
const card = StyleSheet.create({
  container: {
    backgroundColor: '#FFFEFC',
    borderWidth: 1,
    borderColor: '#EBDCD0',
    borderRadius: 26,
    padding: 22,
    gap: 18,
  },
  visitLabel: { fontFamily: 'JakartaSemiBold', fontSize: 11, color: colors.rust },
  date: { fontFamily: 'Jakarta', fontSize: 11, color: colors.muted },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  title: {
    fontFamily: 'Epilogue',
    fontSize: 23,
    lineHeight: 32,
    letterSpacing: -0.7,
    color: colors.ink,
    flex: 1,
  },
  meta: { alignItems: 'flex-end', gap: 8, maxWidth: '40%' },
  score: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: '#F2D4C9',
    backgroundColor: '#FAE9E2',
    borderRadius: 30,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  scoreText: { fontFamily: 'JakartaSemiBold', fontSize: 12, color: colors.rust },
  outOf: { fontFamily: 'Jakarta', fontSize: 10 },
  badge: {
    fontFamily: 'Jakarta',
    fontSize: 10,
    color: colors.muted,
    borderWidth: 1,
    borderColor: '#DCD1C4',
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  firstVisit: { backgroundColor: '#E6EFDF', color: '#3F5934', borderColor: '#D8E2D4' },
  location: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  notes: {
    fontFamily: 'Jakarta',
    fontSize: 14,
    lineHeight: 25,
    color: colors.muted,
    fontStyle: 'italic',
  },
  dishes: { backgroundColor: '#F8F4ED', borderRadius: 14, paddingHorizontal: 12 },
  dishRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 11,
  },
  dishScore: { fontFamily: 'JakartaSemiBold', fontSize: 11, color: colors.rust },
  footer: {
    borderTopWidth: 1,
    borderColor: '#EEE6DC',
    paddingTop: 14,
    minHeight: 44,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 7,
  },
});
