import { ActivityIndicator, Text, View } from 'react-native';
import { usePlaceLookups } from './convexLive';
import { Button, colors, styles } from './ui';

export function PlaceLookupNotice({
  placeIds,
  map = false,
}: {
  placeIds: string[];
  map?: boolean;
}) {
  const { states, retry } = usePlaceLookups(placeIds);
  const lookups = [...new Set(placeIds)].map((id) => states.get(id));
  const failures = lookups.filter((state) => state?.status === 'error');
  const loading = lookups.some((state) => !state || state.status === 'loading');
  if (!failures.length && !loading) return null;
  return (
    <View style={{ gap: 8, padding: 12, borderRadius: 12, backgroundColor: colors.paper }}>
      {failures.length > 0 && (
        <>
          <Text accessibilityRole="alert" style={styles.muted}>
            {map
              ? `${failures.length} saved ${failures.length === 1 ? 'place couldn’t' : 'places couldn’t'} load on the map. `
              : ''}
            {failures[0]?.status === 'error' ? failures[0].error.message : ''}
          </Text>
          <Button secondary title="Retry" onPress={() => void retry()} />
        </>
      )}
      {loading && (
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          <ActivityIndicator size="small" color={colors.rust} />
          <Text accessibilityRole="progressbar" style={styles.muted}>
            {map ? 'Loading saved place pins…' : 'Loading place details…'}
          </Text>
        </View>
      )}
    </View>
  );
}
