import { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Modal,
  PanResponder,
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
} from 'react-native';
import { Button } from 'react-native-paper';
import { Image } from 'expo-image';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  clampCropTransform,
  fitCropPhoto,
  pinchCropPhoto,
  profilePhotoCrop,
  type PhotoSize,
  type PhotoTransform,
  type SquareCrop,
} from './profilePhotoCrop';
import { colors, ErrorNote } from './ui';

type CropAsset = PhotoSize & { uri: string };

export function ProfilePhotoCropper({
  asset,
  busy,
  error,
  onCancel,
  onDone,
}: {
  asset: CropAsset;
  busy: boolean;
  error: string;
  onCancel: () => void;
  onDone: (crop: SquareCrop) => void;
}) {
  const insets = useSafeAreaInsets();
  const [available, setAvailable] = useState({ width: 0, height: 0 });
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const selection = useRef(profilePhotoCrop(asset, 1, { scale: 1, x: 0, y: 0 }));
  const frame = Math.max(0, Math.min(available.width - 40, available.height - 32, 420));
  const cancel = () => {
    if (!busy) onCancel();
  };
  return (
    <Modal
      visible
      animationType="fade"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={cancel}
    >
      <View
        style={[
          cropper.root,
          { paddingTop: insets.top, paddingBottom: Math.max(insets.bottom, 16) },
        ]}
      >
        <StatusBar style="light" />
        <View style={cropper.header}>
          <Button textColor="#fff" disabled={busy} onPress={cancel}>
            Cancel
          </Button>
          <Button
            mode="contained"
            buttonColor={colors.rust}
            textColor="#fff"
            disabled={busy || !ready || failed}
            loading={busy}
            onPress={() => onDone(selection.current)}
          >
            Done
          </Button>
        </View>
        <Text accessibilityRole="header" style={cropper.title}>
          Position your photo
        </Text>
        <Text style={cropper.hint}>Drag to move. Pinch to zoom.</Text>
        <View
          style={cropper.stage}
          onLayout={({ nativeEvent }) => setAvailable(nativeEvent.layout)}
        >
          {frame > 0 && (
            <CropCanvas
              key={`${asset.uri}:${frame}`}
              asset={asset}
              frame={frame}
              disabled={busy || !ready || failed}
              onChange={(crop) => {
                selection.current = crop;
              }}
              onReady={() => {
                setReady(true);
                setFailed(false);
              }}
              onError={() => {
                setReady(false);
                setFailed(true);
              }}
            />
          )}
          {!ready && !failed && <ActivityIndicator color="#fff" style={StyleSheet.absoluteFill} />}
        </View>
        <View style={cropper.message}>
          {failed && (
            <Text style={cropper.hint}>Unable to load this photo. Cancel and choose another.</Text>
          )}
          <ErrorNote error={error} />
        </View>
      </View>
    </Modal>
  );
}

function CropCanvas({
  asset,
  frame,
  disabled,
  onChange,
  onReady,
  onError,
}: {
  asset: CropAsset;
  frame: number;
  disabled: boolean;
  onChange: (crop: SquareCrop) => void;
  onReady: () => void;
  onError: () => void;
}) {
  const canvas = useRef<View>(null);
  const origin = useRef({ x: 0, y: 0 });
  const transform = useRef<PhotoTransform>({ scale: 1, x: 0, y: 0 });
  const [scale] = useState(() => new Animated.Value(1));
  const [x] = useState(() => new Animated.Value(0));
  const [y] = useState(() => new Animated.Value(0));
  const gesture = useRef({
    mode: 'pan' as 'pan' | 'pinch',
    start: { scale: 1, x: 0, y: 0 },
    point: { x: 0, y: 0 },
    distance: 1,
  });
  const fitted = fitCropPhoto(asset, frame);
  const apply = useCallback(
    (value: PhotoTransform) => {
      const next = clampCropTransform(value, asset, frame);
      transform.current = next;
      scale.setValue(next.scale);
      x.setValue(next.x);
      y.setValue(next.y);
      onChange(profilePhotoCrop(asset, frame, next));
    },
    [asset, frame, onChange, scale, x, y],
  );
  const drag = useMemo(() => {
    const point = (touch: { pageX: number; pageY: number }) => ({
      x: touch.pageX - origin.current.x - frame / 2,
      y: touch.pageY - origin.current.y - frame / 2,
    });
    const begin = (event: GestureResponderEvent) => {
      const touches = event.nativeEvent.touches;
      if (!touches.length) return;
      const a = point(touches[0]);
      const b = touches.length > 1 ? point(touches[1]) : a;
      gesture.current = {
        mode: touches.length > 1 ? 'pinch' : 'pan',
        start: { ...transform.current },
        point: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
        distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
      };
    };
    // eslint-disable-next-line react/refs -- PanResponder stores callbacks for touch events.
    return PanResponder.create({
      onStartShouldSetPanResponder: () => !disabled,
      onMoveShouldSetPanResponder: () => !disabled,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: begin,
      onPanResponderStart: begin,
      onPanResponderEnd: begin,
      onPanResponderMove: (event) => {
        if (disabled) return;
        const touches = event.nativeEvent.touches;
        if (!touches.length) return;
        const mode = touches.length > 1 ? 'pinch' : 'pan';
        if (gesture.current.mode !== mode) begin(event);
        const a = point(touches[0]);
        const start = gesture.current;
        if (mode === 'pinch') {
          const b = point(touches[1]);
          apply(
            pinchCropPhoto(
              start.start,
              start.point,
              { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
              Math.hypot(a.x - b.x, a.y - b.y) / start.distance,
              asset,
              frame,
            ),
          );
        } else {
          apply({
            ...start.start,
            x: start.start.x + a.x - start.point.x,
            y: start.start.y + a.y - start.point.y,
          });
        }
      },
    });
  }, [asset, frame, disabled, apply]);
  return (
    <View
      ref={canvas}
      style={{ width: frame, height: frame, overflow: 'hidden' }}
      onLayout={() =>
        canvas.current?.measureInWindow((left, top) => {
          origin.current = { x: left, y: top };
          onChange(profilePhotoCrop(asset, frame, transform.current));
        })
      }
      {...drag.panHandlers}
      accessible
      accessibilityLabel="Photo position within the fixed square"
      accessibilityHint="Drag to move the photo and pinch to zoom."
      accessibilityActions={[
        { name: 'increment', label: 'Zoom in' },
        { name: 'decrement', label: 'Zoom out' },
        { name: 'left', label: 'Move photo left' },
        { name: 'right', label: 'Move photo right' },
        { name: 'up', label: 'Move photo up' },
        { name: 'down', label: 'Move photo down' },
      ]}
      onAccessibilityAction={({ nativeEvent }) => {
        if (disabled) return;
        const current = transform.current;
        const action = nativeEvent.actionName;
        if (action === 'increment' || action === 'decrement') {
          apply(
            pinchCropPhoto(
              current,
              { x: 0, y: 0 },
              { x: 0, y: 0 },
              action === 'increment' ? 1.25 : 0.8,
              asset,
              frame,
            ),
          );
        } else {
          const step = frame / 10;
          apply({
            ...current,
            x: current.x + (action === 'left' ? -step : action === 'right' ? step : 0),
            y: current.y + (action === 'up' ? -step : action === 'down' ? step : 0),
          });
        }
      }}
    >
      <Animated.View
        pointerEvents="none"
        style={{
          position: 'absolute',
          width: fitted.width,
          height: fitted.height,
          left: (frame - fitted.width) / 2,
          top: (frame - fitted.height) / 2,
          transform: [{ translateX: x }, { translateY: y }, { scale }],
        }}
      >
        <Image
          source={{ uri: asset.uri }}
          style={{ width: '100%', height: '100%' }}
          contentFit="fill"
          onLoad={onReady}
          onError={onError}
        />
      </Animated.View>
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, cropper.frame]}>
        {[1 / 3, 2 / 3].map((position) => (
          <View key={position} style={StyleSheet.absoluteFill}>
            <View
              style={[
                cropper.grid,
                { left: frame * position, top: 0, bottom: 0, width: StyleSheet.hairlineWidth },
              ]}
            />
            <View
              style={[
                cropper.grid,
                { top: frame * position, left: 0, right: 0, height: StyleSheet.hairlineWidth },
              ]}
            />
          </View>
        ))}
      </View>
    </View>
  );
}

const cropper = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#111' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
  },
  title: {
    color: '#fff',
    fontFamily: 'EpilogueSemiBold',
    fontSize: 22,
    textAlign: 'center',
    marginTop: 12,
  },
  hint: { color: '#ccc', fontFamily: 'Jakarta', fontSize: 14, textAlign: 'center', marginTop: 12 },
  stage: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  frame: { borderWidth: 1, borderColor: '#fff' },
  grid: { position: 'absolute', backgroundColor: '#ffffff70' },
  message: { paddingHorizontal: 24, paddingBottom: 12 },
});
