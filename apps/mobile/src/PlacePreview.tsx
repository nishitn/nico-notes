import { GoogleAttribution } from './GoogleAttribution';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
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
  const { height: windowHeight } = useWindowDimensions();
  const [entranceY] = useState(() => new Animated.Value(windowHeight));
  const entranceStarted = useRef(false);
  const [translateY] = useState(() => new Animated.Value(0));
  useEffect(() => () => entranceY.stopAnimation(), [entranceY]);
  const drag = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_, gesture) =>
          gesture.dy > 6 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
        onPanResponderMove: (_, gesture) => translateY.setValue(Math.max(0, gesture.dy)),
        onPanResponderRelease: (_, gesture) => {
          if (gesture.dy > 80 || (gesture.dy > 15 && gesture.vy > 0.7)) onClose();
          else Animated.spring(translateY, { toValue: 0, useNativeDriver: true }).start();
        },
        onPanResponderTerminate: () => {
          Animated.spring(translateY, { toValue: 0, useNativeDriver: true }).start();
        },
      }),
    [onClose, translateY],
  );
  return (
    <Modal transparent visible animationType="none" onRequestClose={onClose}>
      <View style={preview.overlay}>
        <Pressable
          style={preview.backdrop}
          accessibilityRole="button"
          accessibilityLabel="Dismiss place details"
          onPress={onClose}
        />
        <Animated.View
          style={[
            preview.drawer,
            { transform: [{ translateY: Animated.add(entranceY, translateY) }] },
          ]}
          onLayout={({ nativeEvent }) => {
            if (entranceStarted.current) return;
            entranceStarted.current = true;
            entranceY.setValue(nativeEvent.layout.height);
            Animated.timing(entranceY, {
              toValue: 0,
              duration: 220,
              easing: Easing.out(Easing.cubic),
              useNativeDriver: true,
            }).start();
          }}
          accessibilityViewIsModal
          onAccessibilityEscape={onClose}
        >
          <SafeAreaView edges={['bottom', 'left', 'right']} style={{ flexShrink: 1 }}>
            <View style={preview.dragArea} {...drag.panHandlers}>
              <View style={preview.handle} />
            </View>
            <ScrollView bounces={false} contentContainerStyle={preview.card}>
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
                <GoogleAttribution
                  placeId={googlePlaceId}
                  attributions={attributions}
                  showGoogleMaps={false}
                />
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
                    <Pressable
                      accessibilityRole="button"
                      onPress={onOpen}
                      style={preview.secondary}
                    >
                      <Text style={preview.link}>View place</Text>
                    </Pressable>
                  )}
                  <Pressable accessibilityRole="button" onPress={onAdd} style={preview.primary}>
                    <Icon source="plus" size={16} color={colors.paper} />
                    <Text style={preview.primaryText}>Add visit</Text>
                  </Pressable>
                </View>
              </View>
            </ScrollView>
          </SafeAreaView>
        </Animated.View>
      </View>
    </Modal>
  );
}
const preview = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: '#00000020' },
  drawer: {
    maxHeight: '75%',
    backgroundColor: colors.paper,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    overflow: 'hidden',
    elevation: 12,
  },
  dragArea: { height: 28, alignItems: 'center', justifyContent: 'center' },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border },
  card: {
    paddingHorizontal: 22,
    paddingTop: 4,
    paddingBottom: 24,
    gap: 14,
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
