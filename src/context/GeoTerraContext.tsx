import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api } from "../api/client";
import type { AiSource, ResultsContract, StatusResponse, VerificationStatus } from "../types/api";

interface GeoTerraContextValue {
  results: ResultsContract | null;
  status: StatusResponse | null;
  loading: boolean;
  error: string | null;
  demoMode: boolean;
  setDemoMode: (val: boolean) => void;
  aiSource: AiSource;
  setLastAiSource: (src: AiSource) => void;
  verificationStatuses: Record<string, VerificationStatus>;
  setSiteVerificationStatus: (id: string, next: VerificationStatus) => void;
  refresh: () => Promise<void>;
}

const GeoTerraContext = createContext<GeoTerraContextValue | null>(null);

const STORAGE_KEY = "geoterra_verification_statuses_v1";

export const GeoTerraProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [results, setResults] = useState<ResultsContract | null>(null);
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [demoMode, setDemoMode] = useState(false);
  const [aiSource, setLastAiSource] = useState<AiSource>("cached");
  const [verificationStatuses, setVerificationStatuses] = useState<Record<string, VerificationStatus>>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? (JSON.parse(saved) as Record<string, VerificationStatus>) : {};
    } catch {
      return {};
    }
  });

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [resData, statusData] = await Promise.all([api.getResults(), api.getStatus()]);
      setResults(resData);
      setStatus(statusData);
      setLastAiSource(demoMode ? "cached" : statusData.ai_mode);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load GeoTerra AI telemetry.");
    } finally {
      setLoading(false);
    }
  }, [demoMode]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (demoMode) {
      setLastAiSource("cached");
    } else if (status) {
      setLastAiSource(status.ai_mode);
    }
  }, [demoMode, status]);

  const setSiteVerificationStatus = useCallback((id: string, next: VerificationStatus) => {
    setVerificationStatuses((prev) => {
      const updated = { ...prev, [id]: next };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      } catch {
        // Ignore storage quota issues
      }
      return updated;
    });
  }, []);

  return (
    <GeoTerraContext.Provider
      value={{
        results,
        status,
        loading,
        error,
        demoMode,
        setDemoMode,
        aiSource,
        setLastAiSource,
        verificationStatuses,
        setSiteVerificationStatus,
        refresh,
      }}
    >
      {children}
    </GeoTerraContext.Provider>
  );
};

export function useGeoTerra(): GeoTerraContextValue {
  const ctx = useContext(GeoTerraContext);
  if (!ctx) {
    throw new Error("useGeoTerra must be used inside GeoTerraProvider");
  }
  return ctx;
}
