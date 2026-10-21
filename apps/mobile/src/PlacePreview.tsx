import { GoogleAttribution } from './GoogleAttribution';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Icon } from 'react-native-paper';
import { colors, styles } from './ui';

export function PlacePreview({
  name,
  address,
  googlePlaceId,
  attributions,
  isNew,
  isWishlisted,
  onClose,
  onOpen,
  onMaps,
  onAdd,
  onWishlist,
}: {
  name: string;
  address: string;
  googlePlaceId?: string;
  attributions?: string[];
  isNew?: boolean;
  isWishlisted?: boolean;
  onClose: () => void;
  onOpen?: () => void;
  onMaps: () => void;
  onAdd: () => void;
  onWishlist?: () => void;
}) {
  return (
    <View style={preview.card}>
      <View style={preview.header}>
        <View style={{ flex: 1, gap: 4 }}>
          {isNew && <Text style={preview.newLabel}>NEW PLACE</Text>}
          <Text accessibilityRole="header" style={preview.title} numberOfLines={2}>
            {name}
          </Text>
          {!!address && (
            <Text numberOfLines={2} style={preview.address}>
              {address}
            </Text>
          )}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close selected place"
          onPress={onClose}
          style={preview.close}
        >
          <Icon source="close" size={20} color={colors.muted} />
        </Pressable>
      </View>
      {(googlePlaceId || isNew) && (
        <GoogleAttribution placeId={googlePlaceId} attributions={attributions} />
      )}
      <View style={preview.actions}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Open ${name} in Google Maps`}
          onPress={onMaps}
          style={preview.maps}
        >
          <Icon source="navigation-variant-outline" size={16} color={colors.rust} />
          <Text style={preview.link}>Maps</Text>
        </Pressable>
        <View style={preview.actionGroup}>
          {onWishlist && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={isWishlisted ? 'Saved to wishlist' : 'Save to wishlist'}
              onPress={onWishlist}
              style={[
                preview.iconButton,
                isWishlisted && {
                  backgroundColor: colors.peachLight,
                  borderColor: colors.peachBorder,
                },
              ]}
            >
              <Icon
                source={isWishlisted ? 'bookmark' : 'bookmark-outline'}
                size={18}
                color={colors.rust}
              />
            </Pressable>
          )}
          {onOpen && (
            <Pressable accessibilityRole="button" onPress={onOpen} style={preview.secondary}>
              <Text style={preview.link}>View place</Text>
            </Pressable>
          )}
          <Pressable accessibilityRole="button" onPress={onAdd} style={preview.primary}>
            <Icon source="plus" size={16} color={colors.paper} />
            <Text style={preview.primaryText}>Add visit</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}
const preview = StyleSheet.create({
  card: {
    padding: 14,
    gap: 8,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.paper,
  },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  title: {
    fontFamily: 'EpilogueSemiBold',
    fontSize: 16,
    lineHeight: 23,
    color: colors.ink,
    letterSpacing: -0.3,
  },
  address: { fontFamily: 'Jakarta', fontSize: 12, lineHeight: 18, color: colors.muted },
  newLabel: { ...styles.eyebrow, color: colors.green, fontSize: 9 },
  close: {
    width: 44,
    height: 44,
    marginTop: -8,
    marginRight: -8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  actionGroup: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  maps: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 5, paddingRight: 8 },
  link: { fontFamily: 'JakartaSemiBold', color: colors.rust, fontSize: 12 },
  primaryText: { fontFamily: 'JakartaSemiBold', color: colors.paper, fontSize: 12 },
  secondary: {
    minHeight: 44,
    paddingHorizontal: 12,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primary: {
    minHeight: 44,
    paddingHorizontal: 12,
    borderRadius: 24,
    backgroundColor: colors.rust,
    flexDirection: 'row',
    gap: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
