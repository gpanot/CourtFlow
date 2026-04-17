import React, { useRef, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Image,
  ActivityIndicator,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Ionicons } from "@expo/vector-icons";

interface FaceCaptureCardProps {
  title?: string;
  hint?: string;
  capturedBase64: string | null;
  onChange: (base64: string | null) => void;
}

export function FaceCaptureCard({
  title = "Face Photo",
  hint = "Position face clearly and capture.",
  capturedBase64,
  onChange,
}: FaceCaptureCardProps) {
  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState<"front" | "back">("front");
  const [cameraReady, setCameraReady] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const cameraRef = useRef<CameraView | null>(null);

  const capture = async () => {
    if (!cameraRef.current || capturing || !cameraReady) return;
    setCapturing(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.7,
        base64: true,
      });
      if (photo.base64) {
        onChange(photo.base64);
      }
    } finally {
      setCapturing(false);
    }
  };

  if (!permission) {
    return (
      <View style={styles.card}>
        <ActivityIndicator color="#3b82f6" />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.card}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.hint}>Camera permission required.</Text>
        <TouchableOpacity style={styles.primaryBtn} onPress={requestPermission}>
          <Text style={styles.primaryBtnText}>Allow Camera</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.hint}>{hint}</Text>

      <View style={styles.previewWrap}>
        {capturedBase64 ? (
          <Image
            source={{ uri: `data:image/jpeg;base64,${capturedBase64}` }}
            style={styles.preview}
            resizeMode="cover"
          />
        ) : (
          <CameraView
            ref={cameraRef}
            style={styles.preview}
            facing={facing}
            onCameraReady={() => setCameraReady(true)}
          />
        )}
      </View>

      <View style={styles.actions}>
        {!capturedBase64 ? (
          <>
            <TouchableOpacity
              style={styles.secondaryBtn}
              onPress={() => setFacing((p) => (p === "front" ? "back" : "front"))}
            >
              <Ionicons name="camera-reverse-outline" size={18} color="#fff" />
              <Text style={styles.secondaryBtnText}>Switch</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.primaryBtn} onPress={capture} disabled={capturing}>
              {capturing ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="camera-outline" size={18} color="#fff" />
                  <Text style={styles.primaryBtnText}>Capture</Text>
                </>
              )}
            </TouchableOpacity>
          </>
        ) : (
          <>
            <TouchableOpacity style={styles.secondaryBtn} onPress={() => onChange(null)}>
              <Text style={styles.secondaryBtnText}>Retake</Text>
            </TouchableOpacity>
            <View style={styles.successChip}>
              <Ionicons name="checkmark-circle" size={18} color="#22c55e" />
              <Text style={styles.successText}>Face captured</Text>
            </View>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#171717",
    borderWidth: 1,
    borderColor: "#262626",
    borderRadius: 16,
    padding: 14,
    gap: 10,
  },
  title: { color: "#fff", fontSize: 16, fontWeight: "700" },
  hint: { color: "#a3a3a3", fontSize: 12 },
  previewWrap: {
    width: "100%",
    aspectRatio: 1,
    position: "relative",
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#262626",
    backgroundColor: "#000",
  },
  preview: { ...StyleSheet.absoluteFillObject },
  actions: { flexDirection: "row", gap: 8, alignItems: "center" },
  primaryBtn: {
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#3b82f6",
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 40,
    flex: 1,
  },
  secondaryBtn: {
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 40,
    backgroundColor: "#262626",
  },
  primaryBtnText: { color: "#fff", fontWeight: "600", fontSize: 14 },
  secondaryBtnText: { color: "#fff", fontWeight: "600", fontSize: 14 },
  successChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
  },
  successText: { color: "#22c55e", fontWeight: "600", fontSize: 14 },
});
