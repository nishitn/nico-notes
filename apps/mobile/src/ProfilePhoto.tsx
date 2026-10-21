import { useState } from 'react';
import {
  Alert,
  Linking,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { Button as MaterialButton, Dialog, Icon, IconButton, Portal } from 'react-native-paper';
import { Image } from 'expo-image';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { File } from 'expo-file-system';
import { fetch } from 'expo/fetch';
import { useAuthToken } from '@convex-dev/auth/react';
import { useMutation } from 'convex/react';
import { api } from '@nico-notes/backend/api';
import { Avatar, Button, colors, ErrorNote, useTask } from './ui';
import { photoOrigin } from './photos';
import { ProfilePhotoCropper } from './ProfilePhotoCropper';
import type { SquareCrop } from './profilePhotoCrop';
import { launchPhotoPicker, type PhotoSource } from './photoPicker';

export function ProfilePhoto({ name, image }: { name: string; image?: string }) {
  const token = useAuthToken();
  const removePhoto = useMutation(api.profile.removePhoto);
  const [open, setOpen] = useState(false);
  const [viewing, setViewing] = useState(false);
  const [viewFailed, setViewFailed] = useState(false);
  const [selected, setSelected] = useState<ImagePicker.ImagePickerAsset>();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const task = useTask();

  async function choosePhoto(source: PhotoSource) {
    if (source === 'camera') {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
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
    if (!token) throw new Error('Sign in again to change your image.');
    const asset = result.assets[0];
    if (asset.width <= 0 || asset.height <= 0)
      throw new Error('Unable to open this image. Please choose another.');
    setOpen(false);
    setSelected(asset);
  }

  async function savePhoto(asset: ImagePicker.ImagePickerAsset, crop: SquareCrop) {
    if (!token) throw new Error('Sign in again to change your image.');
    const converted = await manipulateAsync(
      asset.uri,
      [{ crop }, { resize: { width: 512, height: 512 } }],
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
        throw new Error(failure?.message ?? 'Unable to upload your image. Please try again.');
      }
      setSelected(undefined);
    } finally {
      if (file.exists) file.delete();
    }
  }

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Change profile image"
        onPress={() => setOpen(true)}
        style={{ width: 76, height: 68, flexShrink: 0 }}
      >
        <Avatar name={name} image={image} size={68} />
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            right: 0,
            bottom: 0,
            width: 28,
            height: 28,
            borderRadius: 14,
            borderWidth: 2,
            borderColor: colors.paper,
            backgroundColor: colors.coralLight,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon source="pencil-outline" size={16} color={colors.rust} />
        </View>
      </Pressable>
      <Portal>
        <Dialog
          visible={open}
          onDismiss={() => !task.busy && setOpen(false)}
          dismissable={!task.busy}
          style={{
            width: Math.min(width - 32, 420),
            alignSelf: 'center',
            marginHorizontal: 0,
            backgroundColor: colors.paper,
          }}
        >
          <Dialog.Title>Profile photo</Dialog.Title>
          <Dialog.Content>
            <View style={{ gap: 4 }}>
              <MaterialButton
                icon="image-outline"
                textColor={colors.ink}
                contentStyle={menu.option}
                labelStyle={menu.label}
                disabled={task.busy || !image}
                onPress={() => {
                  setOpen(false);
                  setViewFailed(false);
                  setViewing(true);
                }}
              >
                View photo
              </MaterialButton>
              <MaterialButton
                icon="camera-outline"
                textColor={colors.ink}
                contentStyle={menu.option}
                labelStyle={menu.label}
                disabled={task.busy}
                onPress={() => void task.run(() => choosePhoto('camera'))}
              >
                Take photo
              </MaterialButton>
              <MaterialButton
                icon="image-multiple-outline"
                textColor={colors.ink}
                contentStyle={menu.option}
                labelStyle={menu.label}
                disabled={task.busy}
                onPress={() => void task.run(() => choosePhoto('library'))}
              >
                Choose from library
              </MaterialButton>
              {!!image && (
                <MaterialButton
                  icon="trash-can-outline"
                  textColor={colors.error}
                  contentStyle={menu.option}
                  labelStyle={menu.label}
                  disabled={task.busy}
                  onPress={() =>
                    void task.run(async () => {
                      await removePhoto({});
                      setOpen(false);
                    })
                  }
                >
                  Remove photo
                </MaterialButton>
              )}
              <ErrorNote error={task.error} />
            </View>
          </Dialog.Content>
          <Dialog.Actions>
            <MaterialButton
              textColor={colors.muted}
              disabled={task.busy}
              onPress={() => setOpen(false)}
            >
              Cancel
            </MaterialButton>
          </Dialog.Actions>
        </Dialog>
      </Portal>
      {selected && (
        <ProfilePhotoCropper
          key={selected.uri}
          asset={selected}
          busy={task.busy}
          error={task.error}
          onCancel={() => setSelected(undefined)}
          onDone={(crop) => void task.run(() => savePhoto(selected, crop))}
        />
      )}
      {viewing && image && (
        <Modal
          visible
          animationType="fade"
          statusBarTranslucent
          navigationBarTranslucent
          onRequestClose={() => setViewing(false)}
        >
          <View
            style={{
              flex: 1,
              backgroundColor: '#000',
              paddingTop: insets.top,
              paddingBottom: insets.bottom,
            }}
          >
            <StatusBar style="light" />
            <View style={{ alignItems: 'flex-end', paddingHorizontal: 8 }}>
              <IconButton
                icon="close"
                iconColor="#fff"
                accessibilityLabel="Close profile image"
                onPress={() => setViewing(false)}
              />
            </View>
            {viewFailed ? (
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
                <Text style={{ color: '#fff' }}>Image unavailable.</Text>
                <Button secondary title="Retry" onPress={() => setViewFailed(false)} />
              </View>
            ) : (
              <Image
                source={{ uri: image }}
                accessibilityLabel={`${name}'s profile image`}
                contentFit="contain"
                style={{ flex: 1, width: '100%' }}
                onError={() => setViewFailed(true)}
              />
            )}
          </View>
        </Modal>
      )}
    </>
  );
}

const menu = StyleSheet.create({
  option: { minHeight: 52, justifyContent: 'flex-start' },
  label: { fontFamily: 'JakartaSemiBold', fontSize: 15 },
});
