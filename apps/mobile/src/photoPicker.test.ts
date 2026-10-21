import { beforeEach, expect, it, vi } from 'vite-plus/test';
import * as ImagePicker from 'expo-image-picker';
import { launchPhotoPicker } from './photoPicker';

vi.mock('expo-image-picker', () => ({
  launchCameraAsync: vi.fn(),
  launchImageLibraryAsync: vi.fn(),
}));

beforeEach(() => vi.clearAllMocks());

it('uses the system photo picker for library images and preserves multiple selection', async () => {
  const result = { canceled: false, assets: [{ uri: 'file:///picked-image.jpg' }] };
  vi.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValueOnce(
    result as ImagePicker.ImagePickerResult,
  );

  expect(await launchPhotoPicker('library', { allowsMultipleSelection: true })).toBe(result);
  expect(ImagePicker.launchImageLibraryAsync).toHaveBeenCalledWith({
    mediaTypes: ['images'],
    allowsEditing: false,
    quality: 1,
    allowsMultipleSelection: true,
  });
  expect(ImagePicker.launchCameraAsync).not.toHaveBeenCalled();
});

it('keeps the system library picker available and passes cancellation through', async () => {
  const result = { canceled: true, assets: null } as const;
  vi.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValueOnce(result);

  expect(await launchPhotoPicker('library')).toBe(result);
  expect(ImagePicker.launchImageLibraryAsync).toHaveBeenCalledWith(
    expect.objectContaining({ mediaTypes: ['images'] }),
  );
  expect(ImagePicker.launchImageLibraryAsync).not.toHaveBeenCalledWith(
    expect.objectContaining({ legacy: true }),
  );
});

it('uses the camera without library or multiple-selection options', async () => {
  await launchPhotoPicker('camera', { allowsMultipleSelection: true });

  expect(ImagePicker.launchCameraAsync).toHaveBeenCalledWith({
    mediaTypes: ['images'],
    quality: 1,
  });
  expect(ImagePicker.launchImageLibraryAsync).not.toHaveBeenCalled();
});
