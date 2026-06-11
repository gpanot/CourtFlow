"use client";

import { useState } from "react";
import { ScanFace, BarChart3 } from "lucide-react";
import { FaceRecognitionTestTab } from "./face-recognition-test-tab";
import { FaceStatsTab } from "./face-stats-tab";
import { useTranslation } from "react-i18next";
import adminI18n from "@/i18n/admin-i18n";

export const dynamic = "force-dynamic";

type ActiveTab = "test" | "stats";

export default function FaceRecognitionTestPage() {
  const { t } = useTranslation("translation", { i18n: adminI18n });
  const [activeTab, setActiveTab] = useState<ActiveTab>("test");

  const tabCls = (tab: ActiveTab) =>
    activeTab === tab
      ? "border-b-2 border-purple-500 px-4 py-2 text-sm font-medium text-purple-400"
      : "border-b-2 border-transparent px-4 py-2 text-sm font-medium text-neutral-500 hover:text-neutral-300";

  return (
    <div className="mx-auto max-w-5xl">
      <div className="flex gap-1 border-b border-neutral-800 mb-6">
        <button type="button" className={tabCls("test")} onClick={() => setActiveTab("test")}>
          <span className="flex items-center gap-1.5">
            <ScanFace className="h-3.5 w-3.5" />
            {t("faceTest.tabTest")}
          </span>
        </button>
        <button type="button" className={tabCls("stats")} onClick={() => setActiveTab("stats")}>
          <span className="flex items-center gap-1.5">
            <BarChart3 className="h-3.5 w-3.5" />
            {t("faceTest.tabStats")}
          </span>
        </button>
      </div>

      {activeTab === "test" && <FaceRecognitionTestTab />}
      {activeTab === "stats" && <FaceStatsTab />}
    </div>
  );
}
