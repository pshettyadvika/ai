import React, { useState } from "react";
import { Layers } from "lucide-react";

interface BeforeAfterSliderProps {
  beforeSrc: string;
  afterSrc: string;
  beforeLabel: string;
  afterLabel: string;
  beforeAlt: string;
  afterAlt: string;
  caption?: string;
}

export const BeforeAfterSlider: React.FC<BeforeAfterSliderProps> = ({
  beforeSrc,
  afterSrc,
  beforeLabel,
  afterLabel,
  beforeAlt,
  afterAlt,
  caption,
}) => {
  const [position, setPosition] = useState(50);
  const [imgError, setImgError] = useState(false);

  return (
    <div className="rounded-lg bg-[#0F1420] border border-slate-800 overflow-hidden">
      <div className="px-4 py-2.5 border-b border-slate-800 flex items-center justify-between gap-2 text-xs">
        <span className="font-medium text-slate-200">{beforeLabel} vs {afterLabel}</span>
        <span className="font-mono text-cyan-300 tabular-nums">{position}% split</span>
      </div>

      <div className="relative w-full aspect-[4/3] bg-[#0B0F17] select-none overflow-hidden">
        {imgError ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-gradient-to-br from-slate-900 to-slate-950">
            <Layers className="w-8 h-8 text-cyan-400 mb-2" aria-hidden="true" />
            <p className="text-sm font-medium text-slate-200">{beforeLabel} / {afterLabel}</p>
            <p className="text-xs text-slate-400 mt-1">Imagery preview unavailable</p>
          </div>
        ) : (
          <>
            <img
              src={afterSrc}
              alt={afterAlt}
              referrerPolicy="no-referrer"
              onError={() => setImgError(true)}
              className="absolute inset-0 w-full h-full object-cover"
            />
            <div
              className="absolute inset-0 overflow-hidden"
              style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}
            >
              <img
                src={beforeSrc}
                alt={beforeAlt}
                referrerPolicy="no-referrer"
                onError={() => setImgError(true)}
                className="absolute inset-0 w-full h-full object-cover"
              />
            </div>

            <div
              className="absolute top-0 bottom-0 w-0.5 bg-cyan-400 pointer-events-none"
              style={{ left: `${position}%` }}
            >
              <div className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-[#07090E] border-2 border-cyan-400 flex items-center justify-center text-[10px] font-mono text-cyan-300">
                ↔
              </div>
            </div>

            <span className="absolute top-3 left-3 px-2 py-1 rounded bg-black/75 text-[11px] font-mono text-slate-100 border border-slate-700">
              {beforeLabel}
            </span>
            <span className="absolute top-3 right-3 px-2 py-1 rounded bg-black/75 text-[11px] font-mono text-cyan-200 border border-cyan-500/40">
              {afterLabel}
            </span>
          </>
        )}
      </div>

      <div className="px-4 py-3 border-t border-slate-800 space-y-2">
        <label className="block">
          <span className="sr-only">Swipe between {beforeLabel} and {afterLabel}</span>
          <input
            type="range"
            min={0}
            max={100}
            value={position}
            onChange={(e) => setPosition(Number(e.target.value))}
            aria-label={`Comparison slider between ${beforeLabel} and ${afterLabel}`}
            className="w-full accent-cyan-400 cursor-ew-resize"
          />
        </label>
        {caption && <p className="text-xs text-slate-400">{caption}</p>}
      </div>
    </div>
  );
};
