import React from "react";
import { ShieldCheck } from "lucide-react";

export const Footer: React.FC = () => (
  <footer className="border-t border-slate-800/90 bg-[#07090E] mt-12">
    <div className="max-w-[1440px] mx-auto px-4 sm:px-6 py-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
      <div className="flex items-start gap-2.5 max-w-3xl">
        <ShieldCheck className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" aria-hidden="true" />
        <p className="text-xs text-slate-300 leading-relaxed">
          <strong className="text-white font-semibold">Responsible Use:</strong> GeoTerra AI is strictly built for protective environmental monitoring, disaster early warning, evidence preservation, and public resilience. All outputs operate at the area, polygon, and public-asset level—never targeting or tracking individuals or vehicles.
        </p>
      </div>
      <div className="text-xs text-slate-400 font-mono whitespace-nowrap shrink-0">
        GeoTerra AI · Orbit to Economy
      </div>
    </div>
  </footer>
);
