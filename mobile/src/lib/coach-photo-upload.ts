import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import { api } from "./api-client";

const OUTPUT_SIZE = 500;
const MAX_BYTES = 500 * 1024;
const JPEG_QUALITY_START = 0.82;

async function fileSizeBytes(uri: string): Promise<number> {
  const response = await fetch(uri);
  const blob = await response.blob();
  return blob.size;
}

/** Resize to square 500×500 and compress JPEG until under 500 KB (API limit). */
export async function prepareCoachPhoto(uri: string): Promise<string> {
  let quality = JPEG_QUALITY_START;
  let result = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: OUTPUT_SIZE, height: OUTPUT_SIZE } }],
    { compress: quality, format: ImageManipulator.SaveFormat.JPEG }
  );

  let size = await fileSizeBytes(result.uri);
  while (size > MAX_BYTES && quality > 0.35) {
    quality -= 0.1;
    result = await ImageManipulator.manipulateAsync(result.uri, [], {
      compress: quality,
      format: ImageManipulator.SaveFormat.JPEG,
    });
    size = await fileSizeBytes(result.uri);
  }

  if (size > MAX_BYTES) {
    throw new Error("Photo is still too large after compression. Try a simpler image.");
  }

  return result.uri;
}

type PickSource = "camera" | "library";

async function pickImage(source: PickSource): Promise<string | null> {
  const pickerOptions: ImagePicker.ImagePickerOptions = {
    mediaTypes: ["images"],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 1,
  };

  const result =
    source === "camera"
      ? await ImagePicker.launchCameraAsync(pickerOptions)
      : await ImagePicker.launchImageLibraryAsync(pickerOptions);

  if (result.canceled || !result.assets[0]?.uri) return null;
  return result.assets[0].uri;
}

export async function pickCoachPhoto(source: PickSource): Promise<string | null> {
  const permission =
    source === "camera"
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();

  if (!permission.granted) {
    throw new Error(
      source === "camera"
        ? "Camera permission is required to take a photo."
        : "Photo library permission is required to choose a photo."
    );
  }

  return pickImage(source);
}

export async function uploadCoachPhoto(localUri: string): Promise<string> {
  const formData = new FormData();
  formData.append("photo", {
    uri: localUri,
    name: "photo.jpg",
    type: "image/jpeg",
  } as unknown as Blob);

  const data = await api.upload<{ coachPhoto: string }>(
    "/api/admin/coach-portal/photo",
    formData
  );
  return data.coachPhoto;
}
