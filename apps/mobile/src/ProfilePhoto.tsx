import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Button as MaterialButton, Dialog, Portal } from 'react-native-paper';
import * as ImagePicker from 'expo-image-picker';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { File } from 'expo-file-system';
import { fetch } from 'expo/fetch';
import { useAuthToken } from '@convex-dev/auth/react';
import { useMutation } from 'convex/react';
import { api } from '@nico-notes/backend/api';
import { Avatar, Button, colors, ErrorNote, useTask } from './ui';
import { photoOrigin } from './photos';

export function ProfilePhoto({ name, image }: { name: string; image?: string }) {
  const token = useAuthToken();
  const removePhoto = useMutation(api.profile.removePhoto);
  const [open, setOpen] = useState(false);
  const task = useTask();

  async function choosePhoto() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 1,
    });
    if (result.canceled) return;
    if (!token) throw new Error('Sign in again to change your photo.');
    const asset = result.assets[0];
    const side = Math.min(asset.width, asset.height);
    const converted = await manipulateAsync(
      asset.uri,
      [
        {
          crop: {
            originX: Math.floor((asset.width - side) / 2),
            originY: Math.floor((asset.height - side) / 2),
            width: side,
            height: side,
          },
        },
        { resize: { width: 512, height: 512 } },
      ],
      { compress: 0.85, format: SaveFormat.JPEG },
    );
    const file = new File(converted.uri);
    try {
      const response = await fetch(`${photoOrigin('convex')}/profile/photo`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'image/jpeg' },
        body: file,
      });
      if (!response.ok) {
        const failure = await response.json().catch(() => null);
        throw new Error(failure?.message ?? 'Unable to upload your photo. Please try again.');
      }
      setOpen(false);
    } finally {
      if (file.exists) file.delete();
    }
  }

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Change profile photo"
        onPress={() => setOpen(true)}
        style={{ alignItems: 'center', gap: 4, minHeight: 88 }}
      >
        <Avatar name={name} image={image} size={68} />
        <Text style={{ fontFamily: 'JakartaSemiBold', fontSize: 11, color: colors.rust }}>
          Change photo
        </Text>
      </Pressable>
      <Portal>
        <Dialog
          visible={open}
          onDismiss={() => !task.busy && setOpen(false)}
          dismissable={!task.busy}
          style={{ backgroundColor: colors.paper }}
        >
          <Dialog.Title>Profile photo</Dialog.Title>
          <Dialog.Content>
            <View style={{ gap: 12 }}>
              <Button
                title={task.busy ? 'Saving…' : 'Choose photo'}
                disabled={task.busy}
                onPress={() => void task.run(choosePhoto)}
              />
              {image && (
                <Button
                  secondary
                  title="Remove photo"
                  disabled={task.busy}
                  onPress={() =>
                    void task.run(async () => {
                      await removePhoto({});
                      setOpen(false);
                    })
                  }
                />
              )}
              <ErrorNote error={task.error} />
            </View>
          </Dialog.Content>
          <Dialog.Actions>
            <MaterialButton disabled={task.busy} onPress={() => setOpen(false)}>
              Cancel
            </MaterialButton>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </>
  );
}
