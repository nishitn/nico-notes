import { Pressable } from 'react-native';
import { Host, HorizontalMultiBrowseCarousel, RNHostView } from '@expo/ui/jetpack-compose';
import { height as composeHeight, fillMaxWidth } from '@expo/ui/jetpack-compose/modifiers';
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
    <Host
      matchContents={false}
      colorScheme="light"
      seedColor={colors.primary}
      style={{ height: 160, width: '100%', borderRadius: 14, overflow: 'hidden' }}
    >
      <HorizontalMultiBrowseCarousel
        preferredItemWidth={210}
        itemSpacing={8}
        modifiers={[composeHeight(160), fillMaxWidth()]}
      >
        {photos.map((id) => (
          <RNHostView key={id} matchContents>
            <Pressable
              onPress={onPress}
              accessibilityRole="button"
              accessibilityLabel={`Open photo for ${title}`}
              style={{ width: 210, height: 160 }}
            >
              <Photo id={id} alt={title} height={160} />
            </Pressable>
          </RNHostView>
        ))}
      </HorizontalMultiBrowseCarousel>
    </Host>
  );
}
