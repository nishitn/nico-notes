import { Pressable, ScrollView, StyleSheet } from 'react-native';
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
        style={carousel.singlePhoto}
      >
        <Photo id={photos[0]} alt={title} height={180} />
      </Pressable>
    );
  }

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={carousel.scrollContent}
      nestedScrollEnabled
    >
      {photos.map((id) => (
        <Pressable
          key={id}
          onPress={onPress}
          accessibilityRole="button"
          accessibilityLabel={`Open photo for ${title}`}
          style={carousel.photoItem}
        >
          <Photo id={id} alt={title} height={160} />
        </Pressable>
      ))}
    </ScrollView>
  );
}

const carousel = StyleSheet.create({
  singlePhoto: {
    width: '100%',
    borderRadius: 12,
    overflow: 'hidden',
  },
  scrollContent: {
    gap: 8,
  },
  photoItem: {
    width: 220,
    height: 160,
    borderRadius: 12,
    overflow: 'hidden',
  },
});
