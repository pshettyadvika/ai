import React from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Footer } from "./components/Footer";
import { Navbar } from "./components/Navbar";
import { SampleBanner } from "./components/SampleBanner";
import { GeoTerraProvider, useGeoTerra } from "./context/GeoTerraContext";
import { AboutPage } from "./pages/AboutPage";
import { AlertsReportsPage } from "./pages/AlertsReportsPage";
import { FloodMonitorPage } from "./pages/FloodMonitorPage";
import { ImpactValuePage } from "./pages/ImpactValuePage";
import { LandChangePage } from "./pages/LandChangePage";
import { ModelDataPage } from "./pages/ModelDataPage";
import { OverviewPage } from "./pages/OverviewPage";
import { SimulationPage } from "./pages/SimulationPage";

const AppShell: React.FC = () => {
  const { results } = useGeoTerra();

  return (
    <div className="min-h-screen flex flex-col bg-[#07090E] text-slate-100">
      <Navbar />
      <SampleBanner sample={Boolean(results?.sample)} />
      <main className="flex-1 max-w-[1440px] w-full mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <Routes>
          <Route path="/" element={<OverviewPage />} />
          <Route path="/flood" element={<FloodMonitorPage />} />
          <Route path="/land-change" element={<LandChangePage />} />
          <Route path="/impact" element={<ImpactValuePage />} />
          <Route path="/model" element={<ModelDataPage />} />
          <Route path="/simulation" element={<SimulationPage />} />
          <Route path="/reports" element={<AlertsReportsPage />} />
          <Route path="/about" element={<AboutPage />} />
        </Routes>
      </main>
      <Footer />
    </div>
  );
};

export default function App() {
  return (
    <BrowserRouter>
      <GeoTerraProvider>
        <AppShell />
      </GeoTerraProvider>
    </BrowserRouter>
  );
}
