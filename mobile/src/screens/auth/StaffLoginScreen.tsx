import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../../lib/api-client";
import { useAuthStore } from "../../stores/auth-store";
import { C } from "../../theme/colors";
import type { StaffLoginResponse } from "../../types/api";
import type { RootStackScreenProps } from "../../navigation/types";
import { mapStaffVenuesToVenues } from "../../lib/map-staff-venues";

export function StaffLoginScreen({
  navigation,
}: RootStackScreenProps<"StaffLogin">) {
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const setAuth = useAuthStore((s) => s.setAuth);

  const handleViewOnboarding = () => {
    // Force onboarding to open again from login.
    setAuth({ onboardingSeen: false });
    navigation.replace("Onboarding");
  };

  const handleLogin = async () => {
    if (!phone.trim() || !password.trim()) {
      Alert.alert("Error", "Please enter phone and password");
      return;
    }

    setLoading(true);
    try {
      const data = await api.post<StaffLoginResponse>(
        "/api/auth/staff-login",
        { phone: phone.trim().replace(/\s+/g, ""), password }
      );

      const staff = data.staff;
      setAuth({
        token: data.token,
        staffId: staff.id,
        staffName: staff.name,
        staffPhone: staff.phone,
        role: staff.role,
        venues: mapStaffVenuesToVenues(staff.venues),
        onboardingCompleted: staff.onboardingCompleted,
      });

      navigation.replace("ContinueAs");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Login failed";
      Alert.alert("Login Failed", message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <View style={styles.inner}>
        <Text style={styles.brand}>CourtPay</Text>
        <Text style={styles.subtitle}>Staff Login</Text>

        <View style={styles.card}>
          <View style={styles.inputWrapper}>
            <Ionicons
              name="call-outline"
              size={18}
              color={C.subtle}
              style={styles.inputIcon}
            />
            <TextInput
              style={styles.input}
              placeholder="Phone number"
              placeholderTextColor={C.dimmed}
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              autoCapitalize="none"
              autoComplete="tel"
            />
          </View>

          <View style={styles.inputWrapper}>
            <Ionicons
              name="lock-closed-outline"
              size={18}
              color={C.subtle}
              style={styles.inputIcon}
            />
            <TextInput
              style={[styles.input, { flex: 1 }]}
              placeholder="Password"
              placeholderTextColor={C.dimmed}
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
            />
            <TouchableOpacity
              onPress={() => setShowPassword(!showPassword)}
              style={styles.eyeBtn}
            >
              <Ionicons
                name={showPassword ? "eye-off-outline" : "eye-outline"}
                size={18}
                color={C.subtle}
              />
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[styles.loginBtn, loading && styles.loginBtnDisabled]}
            onPress={handleLogin}
            disabled={loading}
            activeOpacity={0.7}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.loginBtnText}>Sign In</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.onboardingLink}
            onPress={handleViewOnboarding}
            activeOpacity={0.7}
          >
            <Text style={styles.onboardingLinkText}>View onboarding</Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.bg,
  },
  inner: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 28,
  },
  brand: {
    fontSize: 34,
    fontWeight: "800",
    color: C.text,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 15,
    color: C.muted,
    textAlign: "center",
    marginTop: 6,
    marginBottom: 36,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.card,
    padding: 20,
    gap: 14,
  },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.inputBg,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.borderLight,
    paddingHorizontal: 14,
    height: 48,
  },
  inputIcon: { marginRight: 10 },
  input: {
    flex: 1,
    color: C.text,
    fontSize: 15,
  },
  eyeBtn: { padding: 4 },
  loginBtn: {
    backgroundColor: C.green600,
    borderRadius: 10,
    height: 48,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 4,
  },
  loginBtnDisabled: { opacity: 0.5 },
  loginBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  onboardingLink: {
    alignItems: "center",
    paddingTop: 4,
    paddingBottom: 2,
  },
  onboardingLinkText: {
    color: C.dimmed,
    fontSize: 13,
    fontWeight: "500",
  },
});
