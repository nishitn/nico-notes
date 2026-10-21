import { Alert, Linking, Pressable, Text, View } from 'react-native';
import { attributionParts } from '@nico-notes/backend/attributions';
import { useLivePlace } from './convexLive';

export function GoogleAttribution({
  placeId,
  attributions = [],
}: {
  placeId?: string;
  attributions?: string[];
}) {
  const live = useLivePlace(placeId);
  return (
    <View style={{ gap: 4, paddingVertical: 6 }}>
      <Text
        accessibilityLabel="Google Maps"
        style={{ fontSize: 12, fontWeight: '400', color: '#5E5E5E' }}
      >
        Google Maps
      </Text>
      {(live?.attributions ?? attributions).map((html, index) => (
        <Text key={index} style={{ fontSize: 12, lineHeight: 18, color: '#5E5E5E' }}>
          {attributionParts(html).map((part, partIndex) => (
            <Text
              key={partIndex}
              accessibilityRole={part.href ? 'link' : undefined}
              onPress={
                part.href
                  ? () => {
                      void Linking.openURL(part.href!);
                    }
                  : undefined
              }
              style={{
                fontWeight: part.bold ? '700' : '400',
                fontStyle: part.italic ? 'italic' : 'normal',
                textDecorationLine: part.href ? 'underline' : 'none',
              }}
            >
              {part.text}
            </Text>
          ))}
        </Text>
      ))}
    </View>
  );
}

export function GoogleSearchInfo() {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() =>
        Alert.alert(
          'About these results',
          'Google ranks places using relevance, distance and prominence. We show up to five matching results; nearby searches use your foreground location when available.',
          [
            {
              text: 'Learn more',
              onPress: () => {
                void Linking.openURL('https://support.google.com/business/answer/7091');
              },
            },
            { text: 'OK' },
          ],
        )
      }
      style={{ paddingVertical: 8 }}
    >
      <Text style={{ fontSize: 12, color: '#5E5E5E', textDecorationLine: 'underline' }}>
        About these results
      </Text>
    </Pressable>
  );
}
