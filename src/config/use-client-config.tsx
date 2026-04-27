"use client";

import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  clientConfigs,
  getResolvedClientConfig,
  readStoredRuntimeClientId,
  resolveClientIdForHydration,
  resolveEffectiveClientId,
  SELECTED_CLIENT_STORAGE_KEY,
  type ClientConfig,
  type ClientId,
} from "@/config/clients";

type Ctx = {
  clientId: ClientId;
  setClientId: (id: ClientId) => void;
};

const ClientConfigContext = createContext<Ctx | null>(null);

export function ClientConfigProvider({ children }: { children: ReactNode }) {
  const [clientId, setClientIdState] = useState<ClientId>(() => resolveClientIdForHydration());

  useLayoutEffect(() => {
    const stored = readStoredRuntimeClientId();
    if (stored) setClientIdState(stored);
  }, []);

  const setClientId = useCallback((id: ClientId) => {
    if (!(id in clientConfigs)) return;
    setClientIdState(id);
    try {
      localStorage.setItem(SELECTED_CLIENT_STORAGE_KEY, id);
    } catch {
      /* ignore */
    }
  }, []);

  const value = useMemo<Ctx>(() => ({ clientId, setClientId }), [clientId, setClientId]);

  return (
    <ClientConfigContext.Provider value={value}>{children}</ClientConfigContext.Provider>
  );
}

/**
 * Current PWA client configuration (tabs, branding, component names).
 * Outside the provider, falls back to getResolvedClientConfig() (storage + env).
 */
export function useClientConfig(): ClientConfig {
  const ctx = useContext(ClientConfigContext);
  return ctx ? clientConfigs[ctx.clientId] : getResolvedClientConfig();
}

export function useClientId(): ClientId {
  const ctx = useContext(ClientConfigContext);
  return ctx?.clientId ?? resolveEffectiveClientId();
}

/** Persists to localStorage under courtflow-selected-client. */
export function useSetStaffClientId(): (id: ClientId) => void {
  const ctx = useContext(ClientConfigContext);
  return ctx?.setClientId ?? (() => {});
}
