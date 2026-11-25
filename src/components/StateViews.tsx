import React from "react";
import { AlertTriangle, Info, RefreshCw } from "lucide-react";

export const PageSkeleton: React.FC<{ rows?: number }> = ({ rows = 4 }) => (
  <div className="space-y-6 animate-pulse" aria-busy="true" aria-label="Loading telemetry">
    <div className="h-24 rounded-lg bg-[#0F1420] border border-slate-800/80" />
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-28 rounded-lg bg-[#0F1420] border border-slate-800/80" />
      ))}
    </div>
    <div className="h-96 rounded-lg bg-[#0F1420] border border-slate-800/80" />
  </div>
);

export const ErrorState: React.FC<{ message: string; onRetry?: () => void }> = ({ message, onRetry }) => (
  <div className="rounded-lg bg-[#0F1420] border border-rose-900/60 p-6 text-slate-200">
    <div className="flex items-start gap-3">
      <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" aria-hidden="true" />
      <div className="space-y-3">
        <div>
          <h2 className="text-base font-semibold text-white">Unable to load dataset</h2>
          <p className="text-sm text-slate-300 mt-1">{message}</p>
        </div>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-md bg-slate-800 hover:bg-slate-700 text-white border border-slate-700 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
            Retry request
          </button>
        )}
      </div>
    </div>
  </div>
);

export const EmptyState: React.FC<{ title: string; description: string }> = ({ title, description }) => (
  <div className="rounded-lg bg-[#0F1420] border border-slate-800 p-8 text-center">
    <Info className="w-6 h-6 text-slate-400 mx-auto mb-2" aria-hidden="true" />
    <h3 className="text-sm font-semibold text-slate-100">{title}</h3>
    <p className="text-sm text-slate-400 mt-1 max-w-md mx-auto">{description}</p>
  </div>
);

export const AssumptionTag: React.FC<{ label?: string }> = ({ label = "Assumption" }) => (
  <span
    className="inline-flex items-center px-2 py-0.5 text-[11px] font-mono font-medium rounded bg-slate-800/90 text-amber-300 border border-amber-500/30 whitespace-nowrap shrink-0"
    title="Configurable planning assumption centralized in backend config"
  >
    {label}
  </span>
);

export const SimulationBadge: React.FC = () => (
  <span className="inline-flex items-center px-2.5 py-0.5 text-[11px] font-mono font-semibold rounded bg-amber-500/15 text-amber-300 border border-amber-500/40 whitespace-nowrap shrink-0">
    SIMULATION
  </span>
);

export const AiVerificationTag: React.FC<{ source: "live" | "cached" }> = ({ source }) => (
  <span className="inline-flex items-center gap-2 text-xs font-mono text-cyan-300">
    <span>AI-assisted, requires official verification</span>
    <span aria-hidden="true" className="text-slate-600">·</span>
    <span className="text-slate-400">Source: {source}</span>
  </span>
);
