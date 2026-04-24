import React, { useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Dimensions,
  TouchableOpacity,
  type ViewToken,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuthStore } from "../../stores/auth-store";
import { C } from "../../theme/colors";
import type { RootStackScreenProps } from "../../navigation/types";
import { useTabletKioskLocale } from "../../hooks/useTabletKioskLocale";
import { TabletLanguageToggle } from "../../components/TabletLanguageToggle";
import type { CheckInScannerStringKey } from "../../lib/tablet-check-in-strings";

const { width } = Dimensions.get("window");

const SLIDE_ICON_KEYS = [
  "card-outline",
  "people-outline",
  "bar-chart-outline",
] as const;

type SlideDef = {
  icon: (typeof SLIDE_ICON_KEYS)[number];
  titleKey: CheckInScannerStringKey;
  bodyKey: CheckInScannerStringKey;
};

export function OnboardingScreen({
  navigation,
}: RootStackScreenProps<"Onboarding">) {
  const insets = useSafeAreaInsets();
  const [currentIndex, setCurrentIndex] = useState(0);
  const flatListRef = useRef<FlatList>(null);
  const setAuth = useAuthStore((s) => s.setAuth);
  const { locale, toggleLocale, t } = useTabletKioskLocale();

  const slides = useMemo<SlideDef[]>(
    () => [
      {
        icon: SLIDE_ICON_KEYS[0],
        titleKey: "onboardingSlide1Title",
        bodyKey: "onboardingSlide1Body",
      },
      {
        icon: SLIDE_ICON_KEYS[1],
        titleKey: "onboardingSlide2Title",
        bodyKey: "onboardingSlide2Body",
      },
      {
        icon: SLIDE_ICON_KEYS[2],
        titleKey: "onboardingSlide3Title",
        bodyKey: "onboardingSlide3Body",
      },
    ],
    []
  );

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems.length > 0 && viewableItems[0].index != null) {
        setCurrentIndex(viewableItems[0].index);
      }
    }
  ).current;

  const viewabilityConfig = useRef({
    viewAreaCoveragePercentThreshold: 50,
  }).current;

  const finish = () => {
    setAuth({ onboardingSeen: true });
    navigation.replace("StaffLogin");
  };

  const next = () => {
    if (currentIndex < slides.length - 1) {
      flatListRef.current?.scrollToIndex({ index: currentIndex + 1 });
    } else {
      finish();
    }
  };

  return (
    <View style={styles.container}>
      <View
        style={[
          styles.topBar,
          { paddingTop: insets.top + 12, paddingBottom: 8 },
        ]}
      >
        <TouchableOpacity style={styles.skipBtn} onPress={finish}>
          <Text style={styles.skipText}>{t("onboardingSkip")}</Text>
        </TouchableOpacity>
        <TabletLanguageToggle locale={locale} onToggle={toggleLocale} />
      </View>

      <FlatList
        ref={flatListRef}
        style={styles.slideList}
        data={slides}
        extraData={locale}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        keyExtractor={(_, i) => String(i)}
        renderItem={({ item }) => (
          <View style={[styles.slide, { width }]}>
            <View style={styles.iconCircle}>
              <Ionicons name={item.icon} size={48} color={C.green500} />
            </View>
            <Text style={styles.title}>{t(item.titleKey)}</Text>
            <Text style={styles.body}>{t(item.bodyKey)}</Text>
          </View>
        )}
      />

      <View style={[styles.footer, { paddingBottom: insets.bottom + 32 }]}>
        <View style={styles.dots}>
          {slides.map((_, i) => (
            <View
              key={i}
              style={[styles.dot, i === currentIndex && styles.dotActive]}
            />
          ))}
        </View>

        <TouchableOpacity
          style={styles.nextBtn}
          onPress={next}
          activeOpacity={0.7}
        >
          <Text style={styles.nextText}>
            {currentIndex === slides.length - 1
              ? t("onboardingGetStarted")
              : t("onboardingNext")}
          </Text>
          <Ionicons name="arrow-forward" size={16} color="#fff" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.bg,
  },
  slideList: {
    flex: 1,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    zIndex: 10,
  },
  skipBtn: {
    backgroundColor: "rgba(34,197,94,0.12)",
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  skipText: {
    color: C.green300,
    fontSize: 14,
    fontWeight: "600",
  },
  slide: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 36,
  },
  iconCircle: {
    width: 92,
    height: 92,
    borderRadius: 46,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 28,
  },
  title: {
    fontSize: 26,
    fontWeight: "700",
    color: C.text,
    textAlign: "center",
    marginBottom: 14,
  },
  body: {
    fontSize: 15,
    color: C.muted,
    textAlign: "center",
    lineHeight: 22,
  },
  footer: {
    paddingHorizontal: 20,
    alignItems: "center",
    gap: 20,
  },
  dots: {
    flexDirection: "row",
    gap: 6,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: C.border,
  },
  dotActive: {
    backgroundColor: C.green500,
    width: 22,
  },
  nextBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.green600,
    width: "100%",
    minHeight: 56,
    paddingHorizontal: 30,
    paddingVertical: 15,
    borderRadius: 12,
    gap: 8,
  },
  nextText: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "700",
  },
});
