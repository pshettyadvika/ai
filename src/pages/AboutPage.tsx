import React from "react";
import { ArrowRight, Database, ShieldCheck } from "lucide-react";

export const AboutPage: React.FC = () => {
  return (
    <div className="space-y-8">
      <div className="border-b border-slate-800 pb-4 space-y-1">
        <h1 className="text-2xl font-bold text-white">About GeoTerra AI — Architecture, Ethics & Roadmap</h1>
        <p className="text-sm text-slate-400">
          Built for Aeromania &apos;26 Mach-A-Thon (&ldquo;Orbit to Economy: AI in Space&rdquo;) with open Copernicus, JRC, ESA, and OSM data.
        </p>
      </div>

      <section className="rounded-lg bg-[#0F1420] border border-slate-800 p-6 space-y-4">
        <h2 className="text-lg font-semibold text-white">End-to-End Architecture</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
          <div className="p-4 rounded bg-[#07090E] border border-slate-800 space-y-1.5">
            <div className="font-mono text-cyan-300">1. Open EO Ingestion</div>
            <div className="font-semibold text-white">Planetary Computer STAC</div>
            <p className="text-slate-400">Sentinel-1 RTC (linear → dB), Sentinel-2 L2A (SCL cloud masked), JRC GSW, ESA WorldCover.</p>
          </div>
          <div className="p-4 rounded bg-[#07090E] border border-slate-800 space-y-1.5">
            <div className="font-mono text-cyan-300">2. ML Segmentation</div>
            <div className="font-semibold text-white">U-Net (ResNet-34)</div>
            <p className="text-slate-400">Trained on Sen1Floods11 v1.1 with Masked BCE+Dice loss; 256×256 blended sliding-window inference.</p>
          </div>
          <div className="p-4 rounded bg-[#07090E] border border-slate-800 space-y-1.5">
            <div className="font-mono text-cyan-300">3. Geospatial Impact</div>
            <div className="font-semibold text-white">EPSG:32643 &amp; OSM</div>
            <p className="text-slate-400">UTM-43N hectare calculations, permanent lake masking, roads/buildings/infrastructure intersection.</p>
          </div>
          <div className="p-4 rounded bg-[#07090E] border border-slate-800 space-y-1.5">
            <div className="font-mono text-cyan-300">4. Grounded AI &amp; PDF</div>
            <div className="font-semibold text-white">NIM + Disk Cache + PDF</div>
            <p className="text-slate-400">Temperature 0.2 briefings over results.json, sha256 disk caching, and ReportLab/PDFKit evidence reports.</p>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-lg bg-[#0F1420] border border-slate-800 p-6 space-y-3">
          <div className="flex items-center gap-2 text-cyan-300">
            <ShieldCheck className="w-5 h-5" aria-hidden="true" />
            <h2 className="text-base font-semibold text-white">Ethics &amp; Governance Commitments</h2>
          </div>
          <ul className="space-y-2 text-xs sm:text-sm text-slate-300 list-disc pl-4">
            <li><strong>Protective Use Only:</strong> Designed strictly for flood resilience, early warning, and environmental evidence—never targeting or tracking individuals or vehicles.</li>
            <li><strong>Honest Validation:</strong> IoU and F1 scores are reported only on labeled Sen1Floods11 Test and Bolivia splits; Karnataka predictions are explicitly labeled <em>Model prediction (unvalidated)</em>.</li>
            <li><strong>Non-Accusatory Screening:</strong> Land-change polygons carry <em>Potential suspicious activity: requires official verification</em> rather than accusing illegal mining.</li>
            <li><strong>Grounded AI &amp; Simulation Transparency:</strong> LLMs/VLMs are forbidden from inventing numbers and HAPS/drone relays are permanently tagged <em>SIMULATION</em>.</li>
          </ul>
        </div>

        <div className="rounded-lg bg-[#0F1420] border border-slate-800 p-6 space-y-3">
          <div className="flex items-center gap-2 text-amber-300">
            <Database className="w-5 h-5" aria-hidden="true" />
            <h2 className="text-base font-semibold text-white">Future Roadmap: NASA-ISRO NISAR Integration</h2>
          </div>
          <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
            NISAR is listed strictly as a future operational roadmap item and is <strong>not used in the current pipeline</strong>. Current NISAR Level-0 Raw Radar Signal Data (L0 RRSD) consists of unfocused telemetry packets requiring specialized SAR focusing prior to geospatial analysis.
          </p>
          <div className="p-3 rounded bg-[#07090E] border border-slate-800 text-xs text-slate-300 flex items-center gap-2">
            <ArrowRight className="w-4 h-4 text-cyan-400 shrink-0" aria-hidden="true" />
            <span>
              Once calibrated Level-2 Geocoded Polarimetric Covariance / Radiometric Terrain Corrected (GCOV/RTC) L-band &amp; S-band products become operationally available, GeoTerra AI&apos;s ingestion layer can fuse L-band canopy penetration with C-band Sentinel-1.
            </span>
          </div>
        </div>
      </section>

      <section className="rounded-lg bg-[#0F1420] border border-slate-800 p-6 space-y-3">
        <h2 className="text-base font-semibold text-white">Open-Data Citations &amp; Team</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-slate-300">
          <ul className="space-y-1.5 list-disc pl-4">
            <li>Bonafilia, D., Tellman, B., Anderson, T., &amp; Issenberg, E. (2020). <em>Sen1Floods11: A georeferenced dataset to train and test deep learning flood algorithms for Sentinel-1.</em> CVPR Workshops.</li>
            <li>Copernicus Sentinel-1 RTC &amp; Sentinel-2 L2A via Microsoft Planetary Computer STAC.</li>
            <li>EC JRC Global Surface Water (Pekel et al., Nature 2016) &amp; ESA WorldCover 10m.</li>
            <li>OpenStreetMap contributors via OSMnx for public infrastructure and road networks.</li>
          </ul>
          <div className="p-4 rounded bg-[#07090E] border border-slate-800 space-y-1">
            <div className="font-semibold text-white">Team GeoTerra AI — Aeromania &apos;26 Mach-A-Thon</div>
            <p className="text-slate-400">Track: Orbit to Economy — AI in Space</p>
            <p className="text-slate-400">Region Focus: Bengaluru &amp; Peri-Urban Karnataka Basin</p>
          </div>
        </div>
      </section>
    </div>
  );
};
