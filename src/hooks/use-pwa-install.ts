"use client";

import { useState, useEffect, useCallback, useSyncExternalStore } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function isMobile(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

let globalPrompt: BeforeInstallPromptEvent | null = null;
let globalInstalled = typeof window !== "undefined" && isStandalone();
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((l) => l());
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    globalPrompt = e as BeforeInstallPromptEvent;
    notify();
  });

  window.addEventListener("appinstalled", () => {
    globalInstalled = true;
    globalPrompt = null;
    notify();
  });
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

let cachedSnapshot = { prompt: globalPrompt, installed: globalInstalled };

function getSnapshot() {
  if (cachedSnapshot.prompt !== globalPrompt || cachedSnapshot.installed !== globalInstalled) {
    cachedSnapshot = { prompt: globalPrompt, installed: globalInstalled };
  }
  return cachedSnapshot;
}

const serverSnapshot = { prompt: null as BeforeInstallPromptEvent | null, installed: false };
function getServerSnapshot() {
  return serverSnapshot;
}

export function usePwaInstall() {
  const store = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const [installed, setInstalled] = useState(store.installed);

  useEffect(() => {
    if (store.installed) setInstalled(true);
  }, [store.installed]);

  const promptInstall = useCallback(async () => {
    if (!globalPrompt) return;
    globalPrompt.prompt();
    const { outcome } = await globalPrompt.userChoice;
    if (outcome === "accepted") {
      globalInstalled = true;
      setInstalled(true);
    }
    globalPrompt = null;
    notify();
  }, []);

  const mobile = isMobile();
  const isIos =
    typeof navigator !== "undefined" &&
    /iPad|iPhone|iPod/.test(navigator.userAgent);

  const canPrompt = store.prompt !== null;
  const showBanner = !installed && (canPrompt || (mobile && !isStandalone()));

  return { showBanner, isIos, installed, promptInstall, canPrompt };
}
