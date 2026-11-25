import React from "react";
import { AlertTriangle } from "lucide-react";

export const SampleBanner: React.FC<{ sample: boolean }> = ({ sample }) => {
  if (!sample) return null;
  return (
    <div
      role="status"
      className="bg-amber-500/15 border-b border-amber-500/40 text-amber-200 px-4 sm:px-6 py-2"
    >
      <div className="max-w-[1440px] mx-auto flex flex-wrap items-center justify-between gap-2 text-xs sm:text-sm">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" aria-hidden="true" />
          <span className="font-mono font-semibold text-amber-300 px-1.5 py-0.5 rounded bg-amber-500/20 border border-amber-400/40">
            SAMPLE DATA
          </span>
          <span>
            Displaying pre-generated Bengaluru/Karnataka demonstration outputs (<code>sample: true</code>). Run the Colab STAC notebooks to load live satellite acquisitions.
          </span>
        </div>
      </div>
    </div>
  );
};
