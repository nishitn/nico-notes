import { useRef, useState } from 'react';
import {
  Alert,
  Linking,
  Modal,
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
import { Button, Card, colors, confirm, ErrorNote, Field, Heading, styles, useTask } from './ui';
import { IconButton } from 'react-native-paper';
import { confirmDiscard, useUnsavedChanges } from './useUnsavedChanges';
import { resolveUpload, uploadError } from './photoUpload';

export function photoOrigin(provider: 'convex' | 'local') {
  if (provider !== 'convex')
    throw new Error('This legacy photo needs migration to Convex. Contact support.');
  const origin = process.env.EXPO_PUBLIC_CONVEX_SITE_URL;
  if (!origin) throw new Error('Convex photo storage is unavailable. Please contact support.');
  const parsed = new URL(origin);
  if (parsed.protocol !== 'https:') throw new Error('Photos require a reachable HTTPS server.');
  return origin.replace(/\/$/, '');
}
export function Photo({
  id,
  alt,
  height = 220,
  style,
  contentFit = 'cover',
}: {
  id: Id<'photos'>;
  alt: string;
  height?: number | `${number}%`;
  style?: StyleProp<ImageStyle>;
  contentFit?: 'cover' | 'contain';
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
          {provider === undefined ? 'Loading photo…' : 'Photo unavailable.'}
        </Text>
        {failed && <Button secondary title="Retry photo" onPress={() => setFailed(false)} />}
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
  const updateCaption = useMutation(api.photos.updateCaption);
  const task = useTask();
  const [selected, setSelected] = useState<string>();
  const [captionLocked, setCaptionLocked] = useState(false);
  const [caption, setCaption] = useState('');
  const [editing, setEditing] = useState<Id<'photos'>>();
  const [editCaption, setEditCaption] = useState('');
  const [viewingId, setViewingId] = useState<Id<'photos'>>();
  useUnsavedChanges(!!selected || !!editing, task.busy);
  const pending = useRef<{ uri: string; ticket: Id<'uploads'>; at: number } | null>(null);
  async function pick(camera: boolean) {
    if (camera) {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          'Camera access is off',
          'Allow camera access in settings, or choose a photo from your library.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Open settings', onPress: () => void Linking.openSettings() },
          ],
        );
        return;
      }
    }
    const result = camera
      ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1 })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
    if (result.canceled) return;
    const converted = await manipulateAsync(
      result.assets[0].uri,
      [{ resize: { width: Math.min(result.assets[0].width, 2400) } }],
      { compress: 0.85, format: SaveFormat.JPEG },
    );
    if (new File(converted.uri).size > MAX_PHOTO_BYTES)
      throw new Error('Choose a photo smaller than 10 MB.');
    if (pending.current) await cancel({ uploadId: pending.current.ticket });
    pending.current = null;
    setCaptionLocked(false);
    setSelected(converted.uri);
  }
  return (
    <View style={{ gap: 16 }}>
      <View style={styles.sectionRow}>
        <Heading>Photos{photos.length ? ` · ${photos.length}` : ''}</Heading>
        {photos.length < MAX_PHOTOS && (
          <Button
            secondary
            title="Add photo"
            disabled={task.busy}
            onPress={() =>
              Alert.alert('Add photo', undefined, [
                {
                  text: 'Photo library',
                  onPress: () =>
                    confirmDiscard(!!selected, task.busy, () => void task.run(() => pick(false))),
                },
                {
                  text: 'Camera',
                  onPress: () =>
                    confirmDiscard(!!selected, task.busy, () => void task.run(() => pick(true))),
                },
                { text: 'Cancel', style: 'cancel' },
              ])
            }
          />
        )}
      </View>
      {photos.map((photo) => (
        <Card key={photo._id}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={photo.caption || 'Open photo'}
            accessibilityHint="View the full image and zoom"
            onPress={() => setViewingId(photo._id)}
          >
            <Photo id={photo._id} alt={photo.caption || 'Visit picture'} />
          </Pressable>
          <View style={styles.sectionRow}>
            {!!photo.caption && <Text style={[styles.body, { flex: 1 }]}>{photo.caption}</Text>}
            {(isAdmin || photo.uploaderId === userId) && (
              <IconButton
                icon="dots-horizontal"
                accessibilityLabel="Photo options"
                onPress={() =>
                  Alert.alert('Photo options', undefined, [
                    {
                      text: 'Edit caption',
                      onPress: () =>
                        confirmDiscard(
                          !!editing &&
                            editCaption !== photos.find((entry) => entry._id === editing)?.caption,
                          task.busy,
                          () => {
                            setEditing(photo._id);
                            setEditCaption(photo.caption);
                          },
                        ),
                    },
                    {
                      text: 'Delete photo',
                      style: 'destructive',
                      onPress: () =>
                        confirm(
                          'Delete this photo?',
                          () =>
                            void task.run(async () => {
                              await remove({ photoId: photo._id });
                              if (editing === photo._id) setEditing(undefined);
                            }),
                        ),
                    },
                    { text: 'Cancel', style: 'cancel' },
                  ])
                }
              />
            )}
          </View>
          {editing === photo._id && (
            <>
              <Field
                label="Photo caption"
                value={editCaption}
                onChangeText={setEditCaption}
                maxLength={300}
              />
              <Button
                secondary
                title="Cancel"
                disabled={task.busy}
                onPress={() => setEditing(undefined)}
              />
              <Button
                title="Save caption"
                disabled={task.busy}
                onPress={() =>
                  void task.run(async () => {
                    await updateCaption({ photoId: photo._id, caption: editCaption });
                    setEditing(undefined);
                  })
                }
              />
            </>
          )}
        </Card>
      ))}
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
                {photos.length}/{MAX_PHOTOS} photos · Up to 10 MB each
              </Text>
              <Field
                label="Caption"
                value={caption}
                onChangeText={setCaption}
                editable={!task.busy && !captionLocked}
                maxLength={500}
              />
              <Button
                title={task.busy ? 'Uploading…' : task.error ? 'Retry upload' : 'Upload picture'}
                disabled={task.busy}
                onPress={() =>
                  void task.run(async () => {
                    if (!token) throw new Error('Sign in to upload a photo.');
                    const upload = await resolveUpload(
                      pending.current?.uri === selected ? pending.current.ticket : undefined,
                      async () => {
                        const ticket = await reserve({ visitId, caption });
                        pending.current = { uri: selected, ticket, at: Date.now() };
                        return ticket;
                      },
                      (uploadId) => convex.query(api.photos.uploadProvider, { uploadId }),
                    );
                    setCaptionLocked(true);
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
                    setCaptionLocked(false);
                    setSelected(undefined);
                    setCaption('');
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
                    setCaptionLocked(false);
                  })
                }
              />
            </Card>
          )}
        </>
      )}
      {viewingId && (
        <PhotoViewer
          photos={photos}
          id={viewingId}
          onSelect={setViewingId}
          onClose={() => setViewingId(undefined)}
        />
      )}
      <ErrorNote error={task.error} />
    </View>
  );
}

function PhotoViewer({
  photos,
  id,
  onSelect,
  onClose,
}: {
  photos: { _id: Id<'photos'>; caption: string }[];
  id: Id<'photos'>;
  onSelect: (id: Id<'photos'>) => void;
  onClose: () => void;
}) {
  const { width, height } = useWindowDimensions();
  const [zoom, setZoom] = useState(1);
  const index = photos.findIndex((photo) => photo._id === id);
  const photo = photos[index];
  const move = (next: number) => {
    setZoom(1);
    onSelect(photos[next]._id);
  };
  if (!photo) return null;
  return (
    <Modal visible animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: 32 }}>
        <View style={[styles.sectionRow, { paddingHorizontal: 16 }]}>
          <Text style={styles.label}>
            {index + 1} / {photos.length}
          </Text>
          <View style={styles.row}>
            <IconButton
              icon={zoom === 1 ? 'magnify-plus-outline' : 'magnify-minus-outline'}
              accessibilityLabel={zoom === 1 ? 'Zoom photo' : 'Fit entire photo'}
              onPress={() => setZoom((value) => (value === 1 ? 2 : 1))}
            />
            <IconButton icon="close" accessibilityLabel="Close photo" onPress={onClose} />
          </View>
        </View>
        <ScrollView
          horizontal
          style={{ flex: 1 }}
          contentContainerStyle={{ minWidth: width, justifyContent: 'center' }}
          key={`${id}:${zoom}`}
        >
          <ScrollView contentContainerStyle={{ minHeight: height - 220, justifyContent: 'center' }}>
            <Photo
              id={id}
              alt={photo.caption || 'Visit photo'}
              height={(height - 220) * zoom}
              style={{ width: width * zoom, borderRadius: 0 }}
              contentFit="contain"
            />
          </ScrollView>
        </ScrollView>
        <Text style={[styles.body, { padding: 16, textAlign: 'center' }]}>{photo.caption}</Text>
        {photos.length > 1 && (
          <View style={[styles.sectionRow, { paddingHorizontal: 16, paddingBottom: 24 }]}>
            <Button
              secondary
              title="Previous"
              disabled={index === 0}
              onPress={() => move(index - 1)}
            />
            <Button
              secondary
              title="Next"
              disabled={index === photos.length - 1}
              onPress={() => move(index + 1)}
            />
          </View>
        )}
      </View>
    </Modal>
  );
}
