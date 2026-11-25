import React, { useState } from "react";
import { Link } from "react-router-dom";
import { Download, ExternalLink, Send, Sparkles } from "lucide-react";
import { api } from "../api/client";
import { AiVerificationTag, ErrorState, PageSkeleton } from "../components/StateViews";
import { useGeoTerra } from "../context/GeoTerraContext";
import type { VerificationStatus } from "../types/api";

const STARTER_QUESTIONS = [
  "What is the estimated cropland loss and how is it calculated?",
  "Which settlements and critical infrastructure are most exposed to flooding?",
  "What are the validated Sen1Floods11 test and Bolivia metrics?",
];

export const AlertsReportsPage: React.FC = () => {
  const {
    results,
    loading,
    error,
    demoMode,
    setLastAiSource,
    verificationStatuses,
    setSiteVerificationStatus,
    refresh,
  } = useGeoTerra();

  const [pdfDownloading, setPdfDownloading] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [summaryText, setSummaryText] = useState<string | null>(null);
  const [summarySource, setSummarySource] = useState<"live" | "cached">("cached");
  const [summaryLoading, setSummaryLoading] = useState(false);

  const [question, setQuestion] = useState("");
  const [qaHistory, setQaHistory] = useState<
    Array<{ q: string; a: string; tag: string; source: "live" | "cached" }>
  >([]);
  const [qaLoading, setQaLoading] = useState(false);

  const handleDownloadPdf = async () => {
    setPdfDownloading(true);
    setPdfError(null);
    try {
      await api.downloadReportPdf(demoMode);
    } catch (err) {
      setPdfError(err instanceof Error ? err.message : "Failed to download PDF");
    } finally {
      setPdfDownloading(false);
    }
  };

  const handleGenerateBriefing = async () => {
    setSummaryLoading(true);
    try {
      const resp = await api.postAlert(undefined, demoMode);
      setSummaryText(resp.alert_text);
      setSummarySource(resp.source);
      setLastAiSource(resp.source);
    } finally {
      setSummaryLoading(false);
    }
  };

  const handleAsk = async (qText: string) => {
    const trimmed = qText.trim();
    if (trimmed.length < 2) return;
    setQaLoading(true);
    try {
      const resp = await api.postAsk(trimmed, demoMode);
      setQaHistory((prev) => [...prev, { q: trimmed, a: resp.answer, tag: resp.tag, source: resp.source }]);
      setLastAiSource(resp.source);
      setQuestion("");
    } finally {
      setQaLoading(false);
    }
  };

  if (loading) return <PageSkeleton />;
  if (error || !results) return <ErrorState message={error || "Telemetry unavailable"} onRetry={refresh} />;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Alerts, Grounded Q&A & Evidence Reports</h1>
          <p className="text-sm text-slate-400 mt-1">
            Track local verification status, export multi-section PDF evidence packets, and query verified telemetry.
          </p>
        </div>

        <button
          type="button"
          onClick={handleDownloadPdf}
          disabled={pdfDownloading}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-md bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-slate-950 text-sm font-semibold transition-colors whitespace-nowrap"
        >
          <Download className="w-4 h-4" aria-hidden="true" />
          {pdfDownloading ? "Building PDF..." : "Generate Evidence Report (PDF)"}
        </button>
      </div>

      {pdfError && (
        <div className="p-3 rounded bg-rose-950/40 border border-rose-800 text-xs text-rose-200">{pdfError}</div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        <div className="xl:col-span-7 space-y-5">
          <div className="rounded-lg bg-[#0F1420] border border-slate-800 p-5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-semibold text-white">Executive AI Situation Summary</h2>
              <button
                type="button"
                onClick={handleGenerateBriefing}
                disabled={summaryLoading}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-cyan-300 text-xs font-medium border border-slate-700"
              >
                <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
                {summaryLoading ? "Generating..." : "Refresh AI Summary"}
              </button>
            </div>
            {summaryText ? (
              <div className="space-y-2">
                <AiVerificationTag source={summarySource} />
                <p className="text-sm text-slate-200 leading-relaxed">{summaryText}</p>
              </div>
            ) : (
              <p className="text-sm text-slate-400">
                Click <strong className="text-slate-200">Refresh AI Summary</strong> or generate the PDF evidence report to compile a grounded briefing from <code>results.json</code>.
              </p>
            )}
          </div>

          <div className="space-y-3">
            <h2 className="text-base font-semibold text-white">Prioritized Verification Cards</h2>
            {results.flood.prioritized_settlements.slice(0, 3).map((s) => {
              const currentStatus = verificationStatuses[s.id] || "New";
              return (
                <div key={s.id} className="rounded-lg bg-[#0F1420] border border-slate-800 p-4 space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="text-sm font-semibold text-white">{s.name} ({s.taluk})</div>
                      <div className="text-xs text-slate-400 font-mono mt-0.5 tabular-nums">
                        {s.flooded_ha.toFixed(1)} ha · {s.buildings_at_risk} buildings · {results.flood.status_label}
                      </div>
                    </div>
                    <Link
                      to="/flood"
                      className="inline-flex items-center gap-1 text-xs text-cyan-300 hover:text-cyan-200"
                    >
                      View on map <ExternalLink className="w-3 h-3" aria-hidden="true" />
                    </Link>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-800/80">
                    <span className="text-xs text-slate-400">Local verification status:</span>
                    <div className="flex items-center gap-1">
                      {(["New", "Under verification", "Verified"] as VerificationStatus[]).map((st) => (
                        <button
                          key={st}
                          type="button"
                          onClick={() => setSiteVerificationStatus(s.id, st)}
                          className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                            currentStatus === st
                              ? "bg-cyan-500/20 text-cyan-200 border border-cyan-500/50"
                              : "bg-[#07090E] text-slate-400 border border-slate-800 hover:text-slate-200"
                          }`}
                        >
                          {st}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}

            {results.change.sites.slice(0, 2).map((c) => {
              const currentStatus = verificationStatuses[c.id] || "New";
              return (
                <div key={c.id} className="rounded-lg bg-[#0F1420] border border-slate-800 p-4 space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="text-sm font-semibold text-white">{c.name} ({c.taluk})</div>
                      <div className="text-xs text-amber-300 mt-0.5">{c.label}</div>
                    </div>
                    <Link
                      to="/land-change"
                      className="inline-flex items-center gap-1 text-xs text-cyan-300 hover:text-cyan-200"
                    >
                      View on map <ExternalLink className="w-3 h-3" aria-hidden="true" />
                    </Link>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-800/80">
                    <span className="text-xs text-slate-400">Local verification status:</span>
                    <div className="flex items-center gap-1">
                      {(["New", "Under verification", "Verified"] as VerificationStatus[]).map((st) => (
                        <button
                          key={st}
                          type="button"
                          onClick={() => setSiteVerificationStatus(c.id, st)}
                          className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                            currentStatus === st
                              ? "bg-cyan-500/20 text-cyan-200 border border-cyan-500/50"
                              : "bg-[#07090E] text-slate-400 border border-slate-800 hover:text-slate-200"
                          }`}
                        >
                          {st}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="xl:col-span-5 rounded-lg bg-[#0F1420] border border-slate-800 p-5 space-y-4">
          <div>
            <h2 className="text-base font-semibold text-white">Grounded Telemetry Q&A</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Strictly answers using figures present in <code>results.json</code> (temperature 0.2).
            </p>
          </div>

          <div className="space-y-2">
            <div className="text-xs text-slate-400">Starter questions:</div>
            <div className="flex flex-col gap-1.5">
              {STARTER_QUESTIONS.map((sq) => (
                <button
                  key={sq}
                  type="button"
                  onClick={() => handleAsk(sq)}
                  disabled={qaLoading}
                  className="text-left px-3 py-2 rounded bg-[#07090E] hover:bg-slate-900 border border-slate-800 hover:border-cyan-500/40 text-xs text-cyan-200 transition-colors"
                >
                  {sq}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
            {qaHistory.map((item, idx) => (
              <div key={idx} className="p-3 rounded bg-[#07090E] border border-slate-800 space-y-2">
                <div className="text-xs font-semibold text-white">{item.q}</div>
                <p className="text-xs text-slate-300 leading-relaxed">{item.a}</p>
                <AiVerificationTag source={item.source} />
              </div>
            ))}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleAsk(question);
            }}
            className="flex items-center gap-2 pt-2 border-t border-slate-800"
          >
            <input
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Ask about flooded ha, INR loss, or test IoU..."
              aria-label="Ask a grounded question about GeoTerra results"
              className="flex-1 px-3 py-2 rounded bg-[#07090E] border border-slate-700 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-cyan-400"
            />
            <button
              type="submit"
              disabled={qaLoading || question.trim().length < 2}
              className="px-3.5 py-2 rounded bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-slate-950 text-sm font-semibold inline-flex items-center gap-1.5"
            >
              <Send className="w-4 h-4" aria-hidden="true" />
              Ask
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
