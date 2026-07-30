import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Settings } from "../../shared/types";
import { settings as settingsApi } from "./api";

interface SettingsContextValue {
  settings: Settings | null;
  loading: boolean;
  refresh: () => Promise<void>;
  save: (payload: Partial<Settings>) => Promise<Settings>;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

/**
 * Business details are needed by the sidebar, the editor's VAT defaults and
 * every printed document, so they're fetched once and shared.
 */
export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      setSettings(await settingsApi.get());
    } catch {
      // A failure here shouldn't blank the app; pages fall back to defaults.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const save = useCallback(async (payload: Partial<Settings>) => {
    const updated = await settingsApi.update(payload);
    setSettings(updated);
    return updated;
  }, []);

  const value = useMemo(
    () => ({ settings, loading, refresh, save }),
    [settings, loading, refresh, save],
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsContextValue {
  const context = useContext(SettingsContext);
  if (!context) throw new Error("useSettings must be used inside a SettingsProvider");
  return context;
}
