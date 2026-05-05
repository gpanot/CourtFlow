import * as Device from "expo-device";
import { Platform } from "react-native";

/**
 * Returns a human-readable device label.
 *
 * On iOS, `Device.modelName` already returns marketing names (e.g. "iPhone 15 Pro").
 * On Android, `Device.modelName` returns the raw `Build.MODEL` code (e.g. "24075RP89G"),
 * so we capitalise the brand and append the model for clarity (e.g. "Xiaomi 24075RP89G"),
 * or prefer `Device.deviceName` if it looks like a real name.
 */
export function getDeviceLabel(): string | undefined {
  if (Platform.OS === "ios") {
    return Device.modelName ?? Device.deviceName ?? undefined;
  }

  const brand = Device.brand;
  const model = Device.modelName;
  const userSetName = Device.deviceName;

  // If the user-set device name contains the brand, it's likely descriptive enough
  // e.g. "Xiaomi 14 Pro" or "Guillaume's Redmi Pad"
  if (userSetName && brand && userSetName.toLowerCase().includes(brand.toLowerCase())) {
    return userSetName;
  }

  // Combine brand + model for something like "Xiaomi 24075RP89G" (better than raw code alone)
  if (brand && model) {
    const capitalisedBrand = brand.charAt(0).toUpperCase() + brand.slice(1);
    // Avoid "Xiaomi Xiaomi 14T Pro" duplication
    if (model.toLowerCase().startsWith(brand.toLowerCase())) {
      return model.charAt(0).toUpperCase() + model.slice(1);
    }
    return `${capitalisedBrand} ${model}`;
  }

  return model ?? userSetName ?? undefined;
}
