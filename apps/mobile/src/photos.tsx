import { useRef, useState } from 'react';
import {
  Keyboard,
  Linking,
  Pressable,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
  type StyleProp,
} from 'react-native';
import { Image, type ImageStyle } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { File } from 'expo-file-system';
import { fetch } from 'expo/fetch';
import { useAuthToken } from '@convex-dev/auth/react';
import { useConvex, useMutation, useQuery } from './convexLive';
import { api } from '@nico-notes/backend/api';
import type { Id } from '@nico-notes/backend/dataModel';
import { MAX_PHOTOS, MAX_PHOTO_BYTES } from '@nico-notes/backend/shared';
import { Button, Card, colors, ErrorNote, styles, useTask } from './ui';
import { IconButton, Portal } from 'react-native-paper';
import { confirmDiscard, useUnsavedChanges } from './useUnsavedChanges';
import { resolveUpload, uploadError } from './photoUpload';
import { PhotoViewer } from './PhotoViewer';
import { DeletePhotoDialog } from './DeletePhotoDialog';
import { PhotoSourceDialog } from './PhotoSourceDialog';
import { launchPhotoPicker, type PhotoSource } from './photoPicker';
import { showAlert } from './alertState';

export function photoOrigin(provider: 'convex' | 'local') {
  if (provider !== 'convex')
    throw new Error('This legacy image needs migration to Convex. Contact support.');
  const origin = process.env.EXPO_PUBLIC_CONVEX_SITE_URL;
  if (!origin) throw new Error('Convex image storage is unavailable. Please contact support.');
  const parsed = new URL(origin);
  if (parsed.protocol !== 'https:') throw new Error('Images require a reachable HTTPS server.');
  return origin.replace(/\/$/, '');
}
export function Photo({
  id,
  alt,
  height = 220,
  style,
  contentFit = 'cover',
  onLoad,
}: {
  id: Id<'photos'>;
  alt: string;
  height?: number | `${number}%`;
  style?: StyleProp<ImageStyle>;
  contentFit?: 'cover' | 'contain';
  onLoad?: (size: { width: number; height: number }) => void;
}) {
  const token = useAuthToken();
  const provider = useQuery(api.photos.fileProvider, token ? { photoId: id } : 'skip');
  const [failed, setFailed] = useState(false);
  let origin = '';
  try {
    if (provider) origin = photoOrigin(provider);
  } catch {
    /* Show unavailable state without breaking the visit. */
  }
  if (!token || !provider || !origin || failed)
    return (
      <View
        style={{
          height: typeof height === 'number' ? height : 150,
          justifyContent: 'center',
          gap: 8,
        }}
      >
        <Text style={styles.muted}>
          {provider === undefined ? 'Loading image…' : 'Image unavailable.'}
        </Text>
        {failed && <Button secondary title="Retry image" onPress={() => setFailed(false)} />}
      </View>
    );
  return (
    <Image
      key={`${id}:${token}`}
      source={{
        uri: `${origin}/photos/file?id=${id}`,
        headers: { Authorization: `Bearer ${token}` },
      }}
      accessibilityLabel={alt}
      style={[{ height, width: '100%', borderRadius: 12 }, style]}
      contentFit={contentFit}
      cachePolicy="none"
      onError={() => setFailed(true)}
      onLoad={(event) => onLoad?.(event.source)}
    />
  );
}
export function PhotoSection({
  visitId,
  photos,
  userId,
  isAdmin,
}: {
  visitId: Id<'visits'>;
  photos: { _id: Id<'photos'>; caption: string; uploaderId: Id<'users'> }[];
  userId?: Id<'users'>;
  isAdmin: boolean;
}) {
  const token = useAuthToken();
  const convex = useConvex();
  const reserve = useMutation(api.photos.reserve);
  const cancel = useMutation(api.photos.cancel);
  const remove = useMutation(api.photos.remove);
  const task = useTask();
  const deleteTask = useTask();
  const [deletingId, setDeletingId] = useState<Id<'photos'>>();
  const [photoSourceOpen, setPhotoSourceOpen] = useState(false);
  const [selected, setSelected] = useState<string>();
  const [viewingId, setViewingId] = useState<Id<'photos'>>();
  const { width } = useWindowDimensions();
  const [galleryWidth, setGalleryWidth] = useState(Math.min(width, 840) - 44);
  const photoWidth = photos.length > 1 ? Math.max(1, galleryWidth - 28) : galleryWidth;
  useUnsavedChanges(!!selected, task.busy);
  const pending = useRef<{ uri: string; ticket: Id<'uploads'>; at: number } | null>(null);
  async function pick(source: PhotoSource) {
    if (source === 'camera') {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        showAlert(
          'Camera access is off',
          'Allow camera access in settings, or choose an image from your library.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Open settings', onPress: () => void Linking.openSettings() },
          ],
        );
        return;
      }
    }
    const result = await launchPhotoPicker(source);
    if (result.canceled) return;
    const converted = await manipulateAsync(
      result.assets[0].uri,
      [{ resize: { width: Math.min(result.assets[0].width, 2400) } }],
      { compress: 0.85, format: SaveFormat.JPEG },
    );
    if (new File(converted.uri).size > MAX_PHOTO_BYTES)
      throw new Error('Choose an image smaller than 10 MB.');
    if (pending.current) await cancel({ uploadId: pending.current.ticket });
    pending.current = null;
    setSelected(converted.uri);
  }
  return (
    <View style={{ gap: 8 }}>
      <View style={[styles.sectionRow, { alignItems: 'baseline' }]}>
        <Text accessibilityRole="header" style={[styles.subtitle, { includeFontPadding: false }]}>
          Images{photos.length ? ` · ${photos.length}` : ''}
        </Text>
        {photos.length < MAX_PHOTOS && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Add image"
            hitSlop={4}
            style={{
              minHeight: 36,
              justifyContent: 'center',
              paddingHorizontal: 8,
              paddingVertical: 4,
            }}
            disabled={task.busy}
            onPress={() => {
              Keyboard.dismiss();
              setPhotoSourceOpen(true);
            }}
          >
            <Text style={[styles.link, { lineHeight: 26, includeFontPadding: false }]}>
              + Add image
            </Text>
          </Pressable>
        )}
      </View>
      {photos.length > 0 && (
        <View onLayout={(event) => setGalleryWidth(event.nativeEvent.layout.width)}>
          <ScrollView
            horizontal
            nestedScrollEnabled
            showsHorizontalScrollIndicator={false}
            snapToInterval={photoWidth + 12}
            decelerationRate="fast"
            contentContainerStyle={{ gap: 12 }}
          >
            {photos.map((photo, index) => {
              const canRemove = isAdmin || photo.uploaderId === userId;
              return (
                <View key={photo._id} style={{ width: photoWidth, gap: 4 }}>
                  <View style={{ borderRadius: 12, overflow: 'hidden' }}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Open image ${index + 1} of ${photos.length}${photo.caption ? `: ${photo.caption}` : ''}`}
                      accessibilityHint="View the full image and zoom"
                      onPress={() => setViewingId(photo._id)}
                    >
                      <Photo
                        id={photo._id}
                        alt={photo.caption || 'Visit picture'}
                        height={photoWidth}
                      />
                    </Pressable>
                    {canRemove && (
                      <IconButton
                        icon="trash-can-outline"
                        iconColor={colors.error}
                        size={18}
                        accessibilityLabel={`Remove image ${index + 1}`}
                        disabled={task.busy}
                        style={{
                          position: 'absolute',
                          top: 4,
                          right: 4,
                          backgroundColor: colors.paper,
                        }}
                        onPress={() => setDeletingId(photo._id)}
                      />
                    )}
                  </View>
                </View>
              );
            })}
          </ScrollView>
        </View>
      )}
      {photos.length < MAX_PHOTOS && (
        <>
          {selected && (
            <Card>
              <Image
                source={{ uri: selected }}
                style={{ height: 180, width: '100%' }}
                cachePolicy="none"
              />
              <Text style={styles.muted}>
                {photos.length}/{MAX_PHOTOS} images · Up to 10 MB each
              </Text>
              <Button
                title={task.busy ? 'Uploading…' : task.error ? 'Retry upload' : 'Upload picture'}
                disabled={task.busy}
                onPress={() =>
                  void task.run(async () => {
                    if (!token) throw new Error('Sign in to upload an image.');
                    const upload = await resolveUpload(
                      pending.current?.uri === selected ? pending.current.ticket : undefined,
                      async () => {
                        const ticket = await reserve({ visitId, caption: '' });
                        pending.current = { uri: selected, ticket, at: Date.now() };
                        return ticket;
                      },
                      (uploadId) => convex.query(api.photos.uploadProvider, { uploadId }),
                    );
                    const response = await fetch(
                      `${photoOrigin(upload.provider)}/photos/upload?ticket=${upload.ticket}`,
                      {
                        method: 'POST',
                        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'image/jpeg' },
                        body: new File(selected),
                        signal: AbortSignal.timeout(120_000),
                      },
                    );
                    if (!response.ok) throw new Error(uploadError(response.status));
                    pending.current = null;
                    setSelected(undefined);
                  })
                }
              />
              <Button
                secondary
                title="Discard selection"
                disabled={task.busy}
                onPress={() =>
                  void task.run(async () => {
                    if (pending.current) await cancel({ uploadId: pending.current.ticket });
                    setSelected(undefined);
                    pending.current = null;
                  })
                }
              />
            </Card>
          )}
        </>
      )}
      {viewingId && (
        <PhotoViewer
          key={viewingId}
          photos={photos}
          id={viewingId}
          userId={userId}
          isAdmin={isAdmin}
          renderPhoto={(photo, size, onLoad) => (
            <Photo
              id={photo._id}
              alt={photo.caption || 'Visit image'}
              height={size.height}
              style={{ width: size.width, borderRadius: 0 }}
              contentFit="contain"
              onLoad={onLoad}
            />
          )}
          onClose={() => setViewingId(undefined)}
        />
      )}
      <PhotoSourceDialog
        visible={photoSourceOpen}
        onDismiss={() => setPhotoSourceOpen(false)}
        onSelect={(source) =>
          confirmDiscard(!!selected, task.busy, () => void task.run(() => pick(source)))
        }
      />
      <Portal>
        <DeletePhotoDialog
          visible={!!deletingId}
          busy={deleteTask.busy}
          error={deleteTask.error}
          onDismiss={() => setDeletingId(undefined)}
          onConfirm={() => {
            if (!deletingId) return;
            void deleteTask.run(async () => {
              await remove({ photoId: deletingId });
              if (viewingId === deletingId) setViewingId(undefined);
              setDeletingId(undefined);
            });
          }}
        />
      </Portal>
      <ErrorNote error={task.error} />
    </View>
  );
}
