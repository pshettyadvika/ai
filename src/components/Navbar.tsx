import React, { useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { ChevronRight, Menu, X } from "lucide-react";
import { useGeoTerra } from "../context/GeoTerraContext";

const NAV_ITEMS = [
  { to: "/", label: "Overview" },
  { to: "/flood", label: "Flood Monitor" },
  { to: "/land-change", label: "Land Change" },
  { to: "/impact", label: "Impact & Value" },
  { to: "/model", label: "Model & Data" },
  { to: "/simulation", label: "Simulation" },
  { to: "/reports", label: "Alerts & Reports" },
  { to: "/about", label: "About" },
];

const DEMO_FLOW = [
  { step: 1, label: "Overview", path: "/" },
  { step: 2, label: "Flood", path: "/flood" },
  { step: 3, label: "Impact", path: "/impact" },
  { step: 4, label: "Model", path: "/model" },
  { step: 5, label: "Change", path: "/land-change" },
  { step: 6, label: "Simulation", path: "/simulation" },
  { step: 7, label: "Report", path: "/reports" },
];

export const Navbar: React.FC = () => {
  const { demoMode, setDemoMode, aiSource } = useGeoTerra();
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <header className="sticky top-0 z-40 border-b border-slate-800/90 bg-[#07090E]/95 backdrop-blur">
      <div className="max-w-[1440px] mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <NavLink
            to="/"
            className="text-lg font-bold tracking-tight text-white whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-cyan-400 rounded"
          >
            GeoTerra <span className="text-cyan-400">AI</span>
          </NavLink>
          <span className="hidden xl:inline-block text-xs text-slate-400 border-l border-slate-800 pl-3 whitespace-nowrap truncate">
            Satellites see it. AI measures it. Authorities act on it.
          </span>
        </div>

        <nav aria-label="Primary navigation" className="hidden lg:flex items-center gap-5">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) =>
                `text-sm font-medium whitespace-nowrap shrink-0 py-1 border-b-2 transition-colors focus-visible:outline-2 focus-visible:outline-cyan-400 ${
                  isActive
                    ? "text-white border-cyan-400"
                    : "text-slate-400 border-transparent hover:text-slate-100"
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="flex items-center gap-3 shrink-0">
          <span
            className={`hidden sm:inline-flex items-center px-2.5 py-1 rounded text-xs font-mono border whitespace-nowrap shrink-0 ${
              aiSource === "live"
                ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/40"
                : "bg-slate-800 text-cyan-300 border-slate-700"
            }`}
          >
            AI: {aiSource}
          </span>

          <button
            type="button"
            onClick={() => setDemoMode(!demoMode)}
            aria-pressed={demoMode}
            className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-cyan-400 ${
              demoMode
                ? "bg-cyan-500 text-slate-950 border-cyan-400 font-semibold"
                : "bg-[#111827] text-slate-200 border-slate-700 hover:border-slate-500"
            }`}
          >
            {demoMode ? "Demo Mode: On" : "Demo Mode"}
          </button>

          <button
            type="button"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label={mobileOpen ? "Close navigation menu" : "Open navigation menu"}
            aria-expanded={mobileOpen}
            className="lg:hidden p-2 rounded-md text-slate-300 hover:text-white hover:bg-slate-800"
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {demoMode && (
        <div className="border-t border-cyan-900/50 bg-[#0B1220] px-4 sm:px-6 py-2">
          <div className="max-w-[1440px] mx-auto flex items-center gap-2 overflow-x-auto text-xs">
            <span className="font-mono text-cyan-300 font-semibold whitespace-nowrap shrink-0 mr-1">
              5-Min Judge Flow (AI pinned to cache):
            </span>
            {DEMO_FLOW.map((item, idx) => {
              const active = location.pathname === item.path;
              return (
                <React.Fragment key={item.path}>
                  <button
                    type="button"
                    onClick={() => navigate(item.path)}
                    className={`px-2.5 py-1 rounded font-medium whitespace-nowrap shrink-0 transition-colors ${
                      active
                        ? "bg-cyan-500/20 text-cyan-200 border border-cyan-400/50"
                        : "text-slate-300 hover:text-white hover:bg-slate-800"
                    }`}
                  >
                    {item.step}. {item.label}
                  </button>
                  {idx < DEMO_FLOW.length - 1 && (
                    <ChevronRight className="w-3.5 h-3.5 text-slate-600 shrink-0" aria-hidden="true" />
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </div>
      )}

      {mobileOpen && (
        <nav aria-label="Mobile navigation" className="lg:hidden border-t border-slate-800 bg-[#0B0F17] px-4 py-3 space-y-1">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              onClick={() => setMobileOpen(false)}
              className={({ isActive }) =>
                `block px-3 py-2 rounded-md text-sm font-medium ${
                  isActive ? "bg-cyan-500/15 text-cyan-300" : "text-slate-300 hover:bg-slate-800"
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      )}
    </header>
  );
};
