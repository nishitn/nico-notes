import { Pressable, Text } from 'react-native';
import type { Doc, Id } from '@nico-notes/backend/dataModel';
import { Card, colors, Heading, styles } from './ui';
import { Photo } from './photos';

export function VisitCard({
  visit,
  onPress,
}: {
  visit: Doc<'visits'> & { photoId?: Id<'photos'> | null; overall?: number | null };
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open ${visit.title}`}
      onPress={onPress}
    >
      <Card>
        {visit.photoId && <Photo id={visit.photoId} alt={visit.title} />}
        <Text style={styles.muted}>
          {visit.date || 'Undated'} · {visit.typeName}
          {visit.visitNumber ? ` · Visit ${visit.visitNumber}` : ''}
        </Text>
        <Heading>{visit.title}</Heading>
        {!!visit.place && <Text style={styles.muted}>{visit.place}</Text>}
        {visit.overall != null && (
          <Text style={[styles.body, { color: colors.coral }]}>
            ★ {visit.overall.toFixed(1)} / 10
          </Text>
        )}
        {!!visit.notes && (
          <Text numberOfLines={3} style={styles.body}>
            {visit.notes}
          </Text>
        )}
      </Card>
    </Pressable>
  );
}
