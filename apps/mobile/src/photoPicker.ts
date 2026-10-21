import * as ImagePicker from 'expo-image-picker';

export type PhotoSource = 'camera' | 'library';

export function launchPhotoPicker(
  source: PhotoSource,
  options: Pick<ImagePicker.ImagePickerOptions, 'allowsMultipleSelection'> = {},
) {
  if (source === 'camera') {
    return ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1 });
  }
  return ImagePicker.launchImageLibraryAsync({
    ...options,
    mediaTypes: ['images'],
    allowsEditing: false,
    quality: 1,
  });
}
