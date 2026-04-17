import React, { useRef, useState } from "react";
import {
  View,
  ActivityIndicator,
  StyleSheet,
  TouchableOpacity,
  Text,
} from "react-native";
import { WebView } from "react-native-webview";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ENV } from "../../config/env";
import { useAuthStore } from "../../stores/auth-store";
import type { RootStackScreenProps } from "../../navigation/types";

export function AdminWebViewScreen({
  navigation,
}: RootStackScreenProps<"AdminWebView">) {
  const insets = useSafeAreaInsets();
  const webViewRef = useRef<WebView>(null);
  const token = useAuthStore((s) => s.token);
  const [canGoBack, setCanGoBack] = useState(false);

  const injectedJS = token
    ? `
    (function() {
      try {
        var data = localStorage.getItem('courtflow-session');
        if (!data) {
          localStorage.setItem('courtflow-session', JSON.stringify({
            state: { token: "${token}", role: "superadmin" },
            version: 0
          }));
          window.location.reload();
        }
      } catch(e) {}
    })();
    true;
  `
    : "true;";

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.toolbar}>
        <TouchableOpacity
          style={styles.toolbarBtn}
          onPress={() => {
            if (canGoBack) {
              webViewRef.current?.goBack();
            } else {
              navigation.goBack();
            }
          }}
        >
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.toolbarTitle}>Admin</Text>
        <TouchableOpacity
          style={styles.toolbarBtn}
          onPress={() => webViewRef.current?.reload()}
        >
          <Ionicons name="reload" size={20} color="#fff" />
        </TouchableOpacity>
      </View>

      <WebView
        ref={webViewRef}
        source={{ uri: ENV.ADMIN_WEB_URL }}
        style={styles.webview}
        injectedJavaScriptBeforeContentLoaded={injectedJS}
        onNavigationStateChange={(navState) => setCanGoBack(navState.canGoBack)}
        startInLoadingState
        renderLoading={() => (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color="#3b82f6" />
          </View>
        )}
        javaScriptEnabled
        domStorageEnabled
        sharedCookiesEnabled
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0a0a0a",
  },
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "#0a0a0a",
    borderBottomWidth: 1,
    borderBottomColor: "#262626",
  },
  toolbarBtn: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  toolbarTitle: {
    fontSize: 17,
    fontWeight: "600",
    color: "#fff",
  },
  webview: {
    flex: 1,
    backgroundColor: "#0a0a0a",
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#0a0a0a",
    justifyContent: "center",
    alignItems: "center",
  },
});
