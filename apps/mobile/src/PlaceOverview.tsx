import type { ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Constants from 'expo-constants';
import { Icon } from 'react-native-paper';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { GoogleAttribution } from './GoogleAttribution';
import { usePlaceLookup } from './convexLive';
import { PlaceLookupNotice } from './PlaceLookupNotice';
import { colors, styles, Title } from './ui';

export function PlaceOverview({
  name,
  eyebrow,
  address,
  location,
  googlePlaceId,
  openGoogleMaps,
  onAddLocation,
  action,
  showGoogleMaps = true,
}: {
  name: string;
  eyebrow?: string;
  address: string;
  location?: { latitude: number; longitude: number };
  googlePlaceId?: string;
  openGoogleMaps: () => void;
  onAddLocation?: () => void;
  action?: ReactNode;
  showGoogleMaps?: boolean;
}) {
  const { state: lookup } = usePlaceLookup(googlePlaceId);
  const unresolved = !!googlePlaceId && lookup?.status !== 'ready';
  const hasMap = Boolean(
    Platform.OS === 'ios'
      ? Constants.expoConfig?.extra?.hasIosMapsKey
      : Constants.expoConfig?.extra?.hasAndroidMapsKey,
  );
  return (
    <View style={{ gap: 14 }}>
      <View style={overview.titleBlock}>
        {eyebrow && <Text style={styles.eyebrow}>{eyebrow}</Text>}
        <View style={overview.titleRow}>
          <Title style={overview.titleText}>{name}</Title>
          {action}
        </View>
        {googlePlaceId && (
          <GoogleAttribution placeId={googlePlaceId} showGoogleMaps={showGoogleMaps} />
        )}
        {!unresolved && (
          <View style={overview.locationRow}>
            <View style={overview.locationLeft}>
              <Icon source="map-marker-outline" size={16} color={colors.rust} />
              <Text numberOfLines={2} style={overview.locationText}>
                {address || 'Location not recorded'}
              </Text>
            </View>
          </View>
        )}
      </View>

      {googlePlaceId && <PlaceLookupNotice placeIds={[googlePlaceId]} />}

      {location && hasMap ? (
        <View style={overview.mapContainer}>
          <MapView
            provider={PROVIDER_GOOGLE}
            style={overview.map}
            initialRegion={{
              latitude: location.latitude,
              longitude: location.longitude,
              latitudeDelta: 0.007,
              longitudeDelta: 0.007,
            }}
            scrollEnabled={false}
            zoomEnabled={true}
            rotateEnabled={false}
            pitchEnabled={false}
            toolbarEnabled={false}
            showsUserLocation={false}
            showsMyLocationButton={false}
          >
            <Marker coordinate={location} title={name} description={address}>
              <View style={overview.pin}>
                <Icon source="heart" size={16} color={colors.paper} />
              </View>
            </Marker>
          </MapView>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open in Google Maps"
            style={overview.mapOverlayButton}
            onPress={openGoogleMaps}
          >
            <Icon source="google-maps" size={15} color={colors.rust} />
            <Text style={overview.mapOverlayText}>Open in Google Maps</Text>
            <Icon source="open-in-new" size={13} color={colors.rust} />
          </Pressable>
        </View>
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={onAddLocation ? 'Add Location from Map' : 'Open in Google Maps'}
          style={overview.mapFallbackCard}
          onPress={onAddLocation ?? openGoogleMaps}
        >
          <Icon source="map-marker-outline" size={28} color={colors.rust} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={overview.mapFallbackTitle}>
              {onAddLocation ? 'Add Location from Map' : 'Open in Google Maps'}
            </Text>
            <Text style={styles.muted}>
              {onAddLocation
                ? 'Choose the correct place to fix its name and location.'
                : 'Tap to open this place and get directions.'}
            </Text>
          </View>
          <Icon
            source={onAddLocation ? 'link-variant' : 'open-in-new'}
            size={18}
            color={colors.rust}
          />
        </Pressable>
      )}
    </View>
  );
}

const overview = StyleSheet.create({
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  titleBlock: {
    gap: 6,
  },
  titleText: {
    flex: 1,
    marginBottom: 0,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  locationLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    flex: 1,
    minWidth: 0,
  },
  locationText: {
    fontFamily: 'Jakarta',
    fontSize: 13,
    color: colors.muted,
    flex: 1,
  },
  mapContainer: {
    height: 190,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.paper,
    position: 'relative',
    marginVertical: 4,
  },
  map: {
    width: '100%',
    height: '100%',
  },
  pin: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.rust,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.paper,
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 2 },
  },
  mapOverlayButton: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.paper,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    elevation: 3,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
  },
  mapOverlayText: {
    fontFamily: 'JakartaSemiBold',
    fontSize: 12,
    color: colors.rust,
  },
  mapFallbackCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 16,
    backgroundColor: colors.coralLight,
    borderWidth: 1,
    borderColor: '#F2D4C9',
    marginVertical: 4,
  },
  mapFallbackTitle: {
    fontFamily: 'JakartaSemiBold',
    fontSize: 14,
    color: colors.rust,
  },
});
