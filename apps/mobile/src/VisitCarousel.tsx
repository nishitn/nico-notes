import { Pressable, ScrollView } from 'react-native';
import type { Id } from '@nico-notes/backend/dataModel';
import { Photo } from './photos';

export function VisitCarousel({
  photos,
  title,
  onPress,
}: {
  photos: Id<'photos'>[];
  title: string;
  onPress: () => void;
}) {
  if (photos.length === 1) {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`Open photo for ${title}`}
      >
        <Photo id={photos[0]} alt={title} height={160} />
      </Pressable>
    );
  }

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: 8 }}
      nestedScrollEnabled
    >
      {photos.map((id) => (
        <Pressable
          key={id}
          onPress={onPress}
          accessibilityRole="button"
          accessibilityLabel={`Open photos for ${title}`}
          style={{ width: 210 }}
        >
          <Photo id={id} alt={title} height={160} />
        </Pressable>
      ))}
    </ScrollView>
  );
}
