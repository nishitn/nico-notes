import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { Icon } from 'react-native-paper';
import type { Id } from '@nico-notes/backend/dataModel';
import { Photo } from './photos';
import { colors } from './ui';

export function VisitCarousel({
  photos,
  title,
  onPress,
}: {
  photos: Id<'photos'>[];
  title: string;
  onPress: () => void;
}) {
  const previewPhotos = photos.slice(0, 3);
  const remainingPhotos = photos.length - previewPhotos.length;

  if (photos.length === 1) {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`Open image for ${title}`}
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
      {previewPhotos.map((id) => (
        <Pressable
          key={id}
          onPress={onPress}
          accessibilityRole="button"
          accessibilityLabel={`Open image for ${title}`}
          style={carousel.photoItem}
        >
          <Photo id={id} alt={title} height={160} />
        </Pressable>
      ))}
      {remainingPhotos > 0 && (
        <Pressable
          onPress={onPress}
          accessibilityRole="button"
          accessibilityLabel={`See ${remainingPhotos} more images for ${title}`}
          style={[carousel.photoItem, carousel.morePhotos]}
        >
          <Icon source="arrow-right" size={18} color={colors.rust} />
          <Text style={carousel.moreTitle}>See more</Text>
          <Text style={carousel.moreCount}>
            +{remainingPhotos} {remainingPhotos === 1 ? 'image' : 'images'}
          </Text>
        </Pressable>
      )}
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
  morePhotos: {
    width: 100,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: colors.peachLight,
    borderWidth: 1,
    borderColor: colors.border,
  },
  moreTitle: {
    fontFamily: 'JakartaSemiBold',
    fontSize: 12,
    color: colors.rust,
  },
  moreCount: {
    fontFamily: 'Jakarta',
    fontSize: 11,
    color: colors.muted,
  },
});
