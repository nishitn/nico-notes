import { useMemo, useState, type ReactNode } from 'react';
import {
  Animated,
  PanResponder,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { colors } from './ui';

export function RatingDrawer({
  children,
  onClose,
  style,
}: {
  children: ReactNode;
  onClose: () => void;
  style: StyleProp<ViewStyle>;
}) {
  const [translateY] = useState(() => new Animated.Value(0));
  const drag = useMemo(() => {
    const reset = () =>
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        overshootClamping: true,
      }).start();

    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gesture) =>
        gesture.dy > 4 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
      onPanResponderGrant: () => translateY.stopAnimation(),
      onPanResponderMove: (_, gesture) => translateY.setValue(Math.max(0, gesture.dy)),
      onPanResponderRelease: (_, gesture) => {
        reset();
        if (gesture.dy > 72 || (gesture.dy > 16 && gesture.vy > 0.7)) onClose();
      },
      onPanResponderTerminate: reset,
    });
  }, [onClose, translateY]);

  return (
    <Animated.View
      style={[style, { transform: [{ translateY }] }]}
      accessibilityViewIsModal
      onAccessibilityEscape={onClose}
    >
      <View
        {...drag.panHandlers}
        style={drawer.handleArea}
        accessible
        accessibilityRole="button"
        accessibilityLabel="Close rating drawer"
        accessibilityHint="Swipe down to close"
        accessibilityActions={[{ name: 'activate', label: 'Close' }]}
        onAccessibilityAction={({ nativeEvent }) => {
          if (nativeEvent.actionName === 'activate') onClose();
        }}
      >
        <View style={drawer.handle} />
      </View>
      {children}
    </Animated.View>
  );
}

const drawer = StyleSheet.create({
  handleArea: {
    height: 24,
    marginTop: -12,
    marginBottom: -12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
  },
});
