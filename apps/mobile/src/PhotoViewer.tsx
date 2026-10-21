import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Animated,
  Easing,
  Modal,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type GestureResponderEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from 'react-native-paper';
import { StatusBar } from 'expo-status-bar';
import type { Id } from '@nico-notes/backend/dataModel';
import { api } from '@nico-notes/backend/api';
import { useMutation } from './convexLive';
import { colors, useTask } from './ui';
import { DeletePhotoDialog } from './DeletePhotoDialog';
import {
  clampPhotoTransform,
  doubleTapPhoto,
  isPhotoDoubleTap,
  photoSwipeAction,
  pinchPhoto,
  visiblePhotoIndex,
  type PhotoSize,
  type PhotoTap,
} from './photoViewerGeometry';

type ViewerPhoto = { _id: Id<'photos'>; caption: string; uploaderId: Id<'users'> };
type RenderPhoto = (
  photo: ViewerPhoto,
  size: PhotoSize,
  onLoad?: (size: PhotoSize) => void,
) => ReactNode;

export function PhotoViewer({
  photos,
  id,
  userId,
  isAdmin,
  renderPhoto,
  onClose,
}: {
  photos: ViewerPhoto[];
  id: Id<'photos'>;
  userId?: Id<'users'>;
  isAdmin: boolean;
  renderPhoto: RenderPhoto;
  onClose: () => void;
}) {
  const window = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [viewport, setViewport] = useState({ width: window.width, height: window.height });
  const [selection, setSelection] = useState({
    id,
    index: Math.max(
      0,
      photos.findIndex((photo) => photo._id === id),
    ),
  });
  const index = visiblePhotoIndex(photos, selection.id, selection.index);
  const photo = photos[index];
  if (photo && (selection.id !== photo._id || selection.index !== index))
    setSelection({ id: photo._id, index });
  const selectPhoto = (photoId: Id<'photos'>) =>
    setSelection({
      id: photoId,
      index: Math.max(
        0,
        photos.findIndex((entry) => entry._id === photoId),
      ),
    });
  const remove = useMutation(api.photos.remove);
  const task = useTask();
  const [deleteOpen, setDeleteOpen] = useState(false);
  useEffect(() => {
    if (photos.length === 0) onClose();
  }, [photos.length, onClose]);
  if (!photo) return null;
  return (
    <Modal
      visible
      transparent
      animationType="fade"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={() => {
        if (deleteOpen) {
          if (!task.busy) setDeleteOpen(false);
        } else onClose();
      }}
    >
      <View style={viewer.root}>
        <StatusBar style="light" />
        <View style={{ flex: 1, paddingTop: insets.top }}>
          <View
            style={{ flex: 1, overflow: 'hidden' }}
            onLayout={({ nativeEvent }) => {
              const { width, height } = nativeEvent.layout;
              if (width > 0 && height > 0) setViewport({ width, height });
            }}
          >
            <PhotoCanvas
              key={`${viewport.width}:${viewport.height}`}
              photos={photos}
              index={index}
              viewport={viewport}
              renderPhoto={renderPhoto}
              onSelect={selectPhoto}
              onClose={onClose}
            />
          </View>
          <View style={[viewer.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
            <View style={viewer.footerRow}>
              <Text accessibilityLiveRegion="polite" style={viewer.counter}>
                {index + 1}/{photos.length}
              </Text>
              {(isAdmin || photo.uploaderId === userId) && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Delete image"
                  disabled={task.busy}
                  style={viewer.deleteButton}
                  onPress={() => setDeleteOpen(true)}
                >
                  <Icon source="trash-can-outline" size={22} color={colors.error} />
                  <Text style={viewer.deleteText}>Delete</Text>
                </Pressable>
              )}
            </View>
          </View>
        </View>
        <DeletePhotoDialog
          visible={deleteOpen}
          busy={task.busy}
          error={task.error}
          onDismiss={() => setDeleteOpen(false)}
          onConfirm={() => {
            const adjacent = photos[index + 1] ?? photos[index - 1];
            void task.run(async () => {
              await remove({ photoId: photo._id });
              setDeleteOpen(false);
              if (adjacent) selectPhoto(adjacent._id);
              else onClose();
            });
          }}
        />
      </View>
    </Modal>
  );
}

function PhotoCanvas({
  photos,
  index,
  viewport,
  renderPhoto,
  onSelect,
  onClose,
}: {
  photos: ViewerPhoto[];
  index: number;
  viewport: PhotoSize;
  renderPhoto: RenderPhoto;
  onSelect: (id: Id<'photos'>) => void;
  onClose: () => void;
}) {
  const photo = photos[index];
  const previous = photos[index - 1];
  const next = photos[index + 1];
  const [scale] = useState(() => new Animated.Value(1));
  const [x] = useState(() => new Animated.Value(0));
  const [y] = useState(() => new Animated.Value(0));
  const [pageX] = useState(() => new Animated.Value(0));
  const [dismissY] = useState(() => new Animated.Value(0));
  const canvas = useRef<View>(null);
  const origin = useRef({ x: 0, y: 0 });
  const imageSize = useRef(viewport);
  const imageSizes = useRef(new Map<string, PhotoSize>());
  const transform = useRef({ scale: 1, x: 0, y: 0 });
  const settling = useRef(false);
  const lastTap = useRef<PhotoTap | null>(null);
  const gesture = useRef({
    mode: 'idle' as 'idle' | 'pinch' | 'pan' | 'horizontal' | 'vertical',
    startPoint: { x: 0, y: 0 },
    startTransform: { scale: 1, x: 0, y: 0 },
    focal: { x: 0, y: 0 },
    distance: 1,
    hadPinch: false,
    startedAt: 0,
  });
  useLayoutEffect(() => {
    transform.current = { scale: 1, x: 0, y: 0 };
    imageSize.current = imageSizes.current.get(photo._id) ?? viewport;
    settling.current = false;
    lastTap.current = null;
    scale.setValue(1);
    x.setValue(0);
    y.setValue(0);
    pageX.setValue(0);
    dismissY.setValue(0);
  }, [photo._id, index, viewport, scale, x, y, pageX, dismissY]);
  useEffect(
    () => () => {
      scale.stopAnimation();
      x.stopAnimation();
      y.stopAnimation();
      pageX.stopAnimation();
      dismissY.stopAnimation();
    },
    [scale, x, y, pageX, dismissY],
  );

  const drag = useMemo(() => {
    const apply = (value: { scale: number; x: number; y: number }) => {
      transform.current = value;
      scale.setValue(value.scale);
      x.setValue(value.x);
      y.setValue(value.y);
    };
    const resetDrag = () => {
      Animated.parallel([
        Animated.spring(pageX, { toValue: 0, useNativeDriver: true }),
        Animated.spring(dismissY, { toValue: 0, useNativeDriver: true }),
      ]).start();
    };
    const point = (touch: { pageX: number; pageY: number }) => ({
      x: touch.pageX - origin.current.x,
      y: touch.pageY - origin.current.y,
    });
    const startPinch = (event: GestureResponderEvent) => {
      const touches = event.nativeEvent.touches;
      if (touches.length < 2) return;
      const a = point(touches[0]);
      const b = point(touches[1]);
      gesture.current = {
        ...gesture.current,
        mode: 'pinch',
        hadPinch: true,
        startTransform: { ...transform.current },
        focal: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
        distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
      };
      pageX.setValue(0);
      dismissY.setValue(0);
    };
    // eslint-disable-next-line react/refs -- PanResponder stores these callbacks for touch events.
    return PanResponder.create({
      onStartShouldSetPanResponder: () => !settling.current,
      onMoveShouldSetPanResponder: () => !settling.current,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (event) => {
        pageX.stopAnimation();
        dismissY.stopAnimation();
        gesture.current = {
          mode: transform.current.scale > 1.01 ? 'pan' : 'idle',
          startPoint: point(event.nativeEvent.touches[0]),
          startTransform: { ...transform.current },
          focal: { x: 0, y: 0 },
          distance: 1,
          hadPinch: false,
          startedAt: event.nativeEvent.timestamp,
        };
        startPinch(event);
      },
      onPanResponderStart: (event) => {
        if (event.nativeEvent.touches.length >= 2) startPinch(event);
      },
      onPanResponderMove: (event) => {
        if (settling.current) return;
        const touches = event.nativeEvent.touches;
        if (touches.length >= 2) {
          if (gesture.current.mode !== 'pinch') startPinch(event);
          const a = point(touches[0]);
          const b = point(touches[1]);
          apply(
            pinchPhoto(
              gesture.current.startTransform,
              gesture.current.focal,
              { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
              Math.hypot(a.x - b.x, a.y - b.y) / gesture.current.distance,
              imageSize.current,
              viewport,
            ),
          );
          return;
        }
        if (!touches.length) return;
        const current = point(touches[0]);
        if (gesture.current.mode === 'pinch') {
          gesture.current.mode = 'pan';
          gesture.current.startPoint = current;
          gesture.current.startTransform = { ...transform.current };
        }
        const dx = current.x - gesture.current.startPoint.x;
        const dy = current.y - gesture.current.startPoint.y;
        if (gesture.current.mode === 'pan') {
          apply(
            clampPhotoTransform(
              {
                scale: transform.current.scale,
                x: gesture.current.startTransform.x + dx,
                y: gesture.current.startTransform.y + dy,
              },
              imageSize.current,
              viewport,
            ),
          );
          return;
        }
        if (gesture.current.mode === 'idle') {
          if (Math.max(Math.abs(dx), Math.abs(dy)) < 6) return;
          gesture.current.mode = Math.abs(dx) > Math.abs(dy) ? 'horizontal' : 'vertical';
        }
        if (gesture.current.mode === 'horizontal') {
          const atEdge = dx > 0 ? !previous : !next;
          pageX.setValue(dx * (atEdge ? 0.2 : 1));
        } else dismissY.setValue(Math.max(0, dy));
      },
      onPanResponderRelease: (touchEvent, event) => {
        const { mode, hadPinch } = gesture.current;
        const now = touchEvent.nativeEvent.timestamp;
        if (
          !hadPinch &&
          Math.hypot(event.dx, event.dy) < 10 &&
          now - gesture.current.startedAt < 250
        ) {
          const tap = { ...gesture.current.startPoint, time: now };
          if (isPhotoDoubleTap(lastTap.current, tap)) {
            const target = doubleTapPhoto(transform.current, tap, imageSize.current, viewport);
            transform.current = target;
            settling.current = true;
            const animation = {
              duration: 220,
              easing: Easing.out(Easing.cubic),
              useNativeDriver: true,
            };
            Animated.parallel([
              Animated.timing(scale, { ...animation, toValue: target.scale }),
              Animated.timing(x, { ...animation, toValue: target.x }),
              Animated.timing(y, { ...animation, toValue: target.y }),
            ]).start(() => {
              settling.current = false;
            });
            lastTap.current = null;
            return;
          }
          lastTap.current = tap;
        } else lastTap.current = null;
        if (hadPinch || mode === 'pan') {
          if (transform.current.scale < 1.02) apply({ scale: 1, x: 0, y: 0 });
          return;
        }
        if (mode !== 'horizontal' && mode !== 'vertical') return;
        const action = photoSwipeAction(
          mode,
          mode === 'horizontal' ? event.dx : event.dy,
          (mode === 'horizontal' ? event.vx : event.vy) * 1000,
          viewport.width,
        );
        if (action === 'close') {
          settling.current = true;
          Animated.timing(dismissY, {
            toValue: viewport.height,
            duration: 180,
            useNativeDriver: true,
          }).start(({ finished }) => {
            if (finished) onClose();
          });
          return;
        }
        const adjacent = action === 'next' ? next : action === 'previous' ? previous : undefined;
        if (adjacent) {
          settling.current = true;
          Animated.timing(pageX, {
            toValue: action === 'next' ? -viewport.width : viewport.width,
            duration: 180,
            useNativeDriver: true,
          }).start(({ finished }) => {
            if (finished) onSelect(adjacent._id);
          });
        } else resetDrag();
      },
      onPanResponderTerminate: () => {
        apply(clampPhotoTransform(transform.current, imageSize.current, viewport));
        resetDrag();
      },
    });
  }, [scale, x, y, pageX, dismissY, previous, next, viewport, onSelect, onClose]);

  return (
    <View
      ref={canvas}
      style={StyleSheet.absoluteFill}
      onLayout={() =>
        canvas.current?.measureInWindow((left, top) => {
          origin.current = { x: left, y: top };
        })
      }
      {...drag.panHandlers}
      accessible
      accessibilityLabel="Image viewer. Pinch to zoom, swipe between images, or swipe down to close."
      accessibilityActions={[
        { name: 'increment', label: 'Next image' },
        { name: 'decrement', label: 'Previous image' },
        { name: 'escape', label: 'Close image viewer' },
      ]}
      onAccessibilityEscape={onClose}
      onAccessibilityAction={({ nativeEvent }) => {
        if (nativeEvent.actionName === 'increment' && next) onSelect(next._id);
        if (nativeEvent.actionName === 'decrement' && previous) onSelect(previous._id);
        if (nativeEvent.actionName === 'escape') onClose();
      }}
    >
      <Animated.View
        style={{
          flexDirection: 'row',
          width: viewport.width * photos.length,
          height: viewport.height,
          left: -viewport.width * index,
          transform: [{ translateX: pageX }, { translateY: dismissY }],
          opacity: dismissY.interpolate({
            inputRange: [0, viewport.height * 0.75],
            outputRange: [1, 0.15],
            extrapolate: 'clamp',
          }),
        }}
      >
        {/* eslint-disable-next-line react/refs -- Only the deferred image onLoad callbacks access refs. */}
        {photos.map((entry, photoIndex) => (
          <View key={entry._id} style={[viewport, { overflow: 'hidden' }]}>
            <Animated.View
              style={[
                viewport,
                photoIndex === index && {
                  transform: [{ translateX: x }, { translateY: y }, { scale }],
                },
              ]}
            >
              {renderPhoto(entry, viewport, (size) => {
                if (size.width > 0 && size.height > 0) {
                  imageSizes.current.set(entry._id, size);
                  if (photoIndex === index) imageSize.current = size;
                }
              })}
            </Animated.View>
          </View>
        ))}
      </Animated.View>
    </View>
  );
}

const viewer = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#111111' },
  footer: { paddingHorizontal: 32, paddingTop: 4 },
  footerRow: { height: 48, alignItems: 'center', justifyContent: 'center' },
  counter: {
    fontFamily: 'Jakarta',
    fontSize: 13,
    lineHeight: 24,
    includeFontPadding: false,
    color: '#FFFFFF',
  },
  deleteButton: {
    position: 'absolute',
    right: 8,
    minHeight: 48,
    minWidth: 96,
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteText: {
    fontFamily: 'JakartaSemiBold',
    fontSize: 14,
    lineHeight: 24,
    includeFontPadding: false,
    color: colors.error,
  },
});
