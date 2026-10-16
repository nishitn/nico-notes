import { useRef, useState } from 'react';
import { Text, View, type StyleProp } from 'react-native';
import { Image, type ImageStyle } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { File } from 'expo-file-system';
import { fetch } from 'expo/fetch';
import { useAuthToken } from '@convex-dev/auth/react';
import { useConvex, useMutation, useQuery } from 'convex/react';
import { api } from '@nico-notes/backend/api';
import type { Id } from '@nico-notes/backend/dataModel';
import { MAX_PHOTOS, MAX_PHOTO_BYTES } from '@nico-notes/backend/shared';
import { Button, Card, confirm, ErrorNote, Field, Heading, styles, useTask } from './ui';

export function photoOrigin(provider: 'convex' | 'local') {
  const origin =
    provider === 'local'
      ? process.env.EXPO_PUBLIC_PHOTO_API_URL
      : process.env.EXPO_PUBLIC_CONVEX_SITE_URL;
  if (!origin)
    throw new Error(
      'Photo storage is unavailable. Ask your board admin to check the photo server.',
    );
  const parsed = new URL(origin);
  if (parsed.protocol !== 'https:') throw new Error('Photos require a reachable HTTPS server.');
  return origin.replace(/\/$/, '');
}
export function Photo({
  id,
  alt,
  height = 220,
  style,
}: {
  id: Id<'photos'>;
  alt: string;
  height?: number | `${number}%`;
  style?: StyleProp<ImageStyle>;
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
      contentFit="cover"
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
  const pending = useRef<{ uri: string; ticket: Id<'uploads'>; at: number } | null>(null);
  async function pick(camera: boolean) {
    if (camera) {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted)
        throw new Error('Allow camera access in Android settings to take a photo.');
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
      <Heading>
        Pictures · {photos.length}/{MAX_PHOTOS}
      </Heading>
      {photos.map((photo) => (
        <Card key={photo._id}>
          <Photo id={photo._id} alt={photo.caption || 'Visit picture'} />
          {!!photo.caption && <Text style={styles.body}>{photo.caption}</Text>}
          {(isAdmin || photo.uploaderId === userId) && (
            <View style={styles.row}>
              <Button
                secondary
                title="Edit caption"
                disabled={task.busy}
                onPress={() => {
                  setEditing(photo._id);
                  setEditCaption(photo.caption);
                }}
              />
              <Button
                secondary
                title="Delete photo"
                disabled={task.busy}
                onPress={() =>
                  confirm(
                    'Delete this photo?',
                    () => void task.run(() => remove({ photoId: photo._id })),
                  )
                }
              />
            </View>
          )}
          {editing === photo._id && (
            <>
              <Field
                label="Photo caption"
                value={editCaption}
                onChangeText={setEditCaption}
                maxLength={300}
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
          <View style={styles.row}>
            <Button
              secondary
              title="Choose picture"
              disabled={task.busy}
              onPress={() => void task.run(() => pick(false))}
            />
            <Button
              secondary
              title="Take photo"
              disabled={task.busy}
              onPress={() => void task.run(() => pick(true))}
            />
          </View>
          {selected && (
            <Card>
              <Image
                source={{ uri: selected }}
                style={{ height: 180, width: '100%' }}
                cachePolicy="none"
              />
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
                    if (
                      !pending.current ||
                      pending.current.uri !== selected ||
                      Date.now() - pending.current.at > 14 * 60_000
                    )
                      pending.current = {
                        uri: selected,
                        ticket: await reserve({ visitId, caption }),
                        at: Date.now(),
                      };
                    setCaptionLocked(true);
                    const provider = await convex.query(api.photos.uploadProvider, {
                      uploadId: pending.current.ticket,
                    });
                    const response = await fetch(
                      `${photoOrigin(provider)}/photos/upload?ticket=${pending.current.ticket}`,
                      {
                        method: 'POST',
                        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'image/jpeg' },
                        body: new File(selected),
                        signal: AbortSignal.timeout(120_000),
                      },
                    );
                    if (!response.ok)
                      throw new Error('Upload failed. Check your connection and retry.');
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
      <ErrorNote error={task.error} />
    </View>
  );
}
