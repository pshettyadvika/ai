import React, { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api } from "../api/client";
import { ErrorState, PageSkeleton } from "../components/StateViews";
import type { ModelResponse, ScenesResponse } from "../types/api";

export const ModelDataPage: React.FC = () => {
  const [modelData, setModelData] = useState<ModelResponse | null>(null);
  const [scenesData, setScenesData] = useState<ScenesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [m, s] = await Promise.all([api.getModel(), api.getScenes()]);
      setModelData(m);
      setScenesData(s);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load model card and STAC scenes.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  if (loading) return <PageSkeleton />;
  if (error || !modelData || !scenesData) return <ErrorState message={error || "Model data missing"} onRetry={load} />;

  const { model_card: card, training_log: log } = modelData;
  const comparisonData = [
    {
      split: "Sen1Floods11 Test (IoU)",
      Baseline: Number(card.metrics.test.baseline_iou),
      "U-Net ResNet34": Number(card.metrics.test.unet_iou),
    },
    {
      split: "Sen1Floods11 Test (F1)",
      Baseline: Number(card.metrics.test.baseline_f1),
      "U-Net ResNet34": Number(card.metrics.test.unet_f1),
    },
    {
      split: "Bolivia Holdout (IoU)",
      Baseline: Number(card.metrics.bolivia_holdout.baseline_iou),
      "U-Net ResNet34": Number(card.metrics.bolivia_holdout.unet_iou),
    },
    {
      split: "Bolivia Holdout (F1)",
      Baseline: Number(card.metrics.bolivia_holdout.baseline_f1),
      "U-Net ResNet34": Number(card.metrics.bolivia_holdout.unet_f1),
    },
  ];

  const cmTest = card.metrics.test.confusion_matrix;

  return (
    <div className="space-y-8">
      <div className="border-b border-slate-800 pb-4 space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold text-white">Model Card & Open Satellite Data</h1>
          <span className="px-2.5 py-1 rounded text-xs font-mono bg-amber-500/15 text-amber-300 border border-amber-500/40">
            Karnataka: Model prediction (unvalidated)
          </span>
        </div>
        <p className="text-sm text-slate-400">
          IoU and F1 metrics are reported strictly on labeled ground-truth splits (Sen1Floods11 Test & Bolivia Holdout).
        </p>
      </div>

      <section className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 rounded-lg bg-[#0F1420] border border-slate-800 p-6 space-y-4">
          <h2 className="text-lg font-semibold text-white">{card.model_name}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div>
              <div className="text-slate-400">Architecture</div>
              <div className="text-slate-100 font-mono mt-0.5">{card.architecture}</div>
            </div>
            <div>
              <div className="text-slate-400">Training Dataset</div>
              <div className="text-slate-100 mt-0.5">
                {card.dataset.name} ({card.dataset.chips_total} chips, {card.dataset.chip_size}, {card.dataset.crs})
              </div>
            </div>
            <div>
              <div className="text-slate-400">Loss Function</div>
              <div className="text-slate-100 font-mono mt-0.5">{card.loss_function}</div>
            </div>
            <div>
              <div className="text-slate-400">Baseline Reference</div>
              <div className="text-slate-100 mt-0.5">
                {card.baseline.name} ({card.baseline.tuned_threshold_vh_db} dB, {card.baseline.tuned_on})
              </div>
            </div>
          </div>
          <div className="pt-3 border-t border-slate-800 text-xs text-slate-300">
            <strong className="text-slate-100">Dataset Citation:</strong> {card.dataset.citation}
          </div>
        </div>

        <div className="rounded-lg bg-[#0F1420] border border-slate-800 p-6 space-y-3">
          <h2 className="text-base font-semibold text-white">Sen1Floods11 Test Confusion Matrix</h2>
          <p className="text-xs text-slate-400">Pixel counts (ignoring -1 no-data mask)</p>
          <div className="grid grid-cols-2 gap-2 text-center font-mono text-xs tabular-nums">
            <div className="p-3 rounded bg-[#07090E] border border-slate-800">
              <div className="text-slate-400">True Negative</div>
              <div className="text-base font-bold text-slate-200 mt-1">{cmTest.tn.toLocaleString("en-IN")}</div>
            </div>
            <div className="p-3 rounded bg-[#07090E] border border-slate-800">
              <div className="text-slate-400">False Positive</div>
              <div className="text-base font-bold text-amber-300 mt-1">{cmTest.fp.toLocaleString("en-IN")}</div>
            </div>
            <div className="p-3 rounded bg-[#07090E] border border-slate-800">
              <div className="text-slate-400">False Negative</div>
              <div className="text-base font-bold text-rose-300 mt-1">{cmTest.fn.toLocaleString("en-IN")}</div>
            </div>
            <div className="p-3 rounded bg-[#07090E] border border-slate-800">
              <div className="text-slate-400">True Positive</div>
              <div className="text-base font-bold text-cyan-300 mt-1">{cmTest.tp.toLocaleString("en-IN")}</div>
            </div>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-lg bg-[#0F1420] border border-slate-800 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-white">Training & Validation Curves</h2>
            <span className="text-xs font-mono text-cyan-300">Best Epoch {log.best_epoch} (IoU {log.best_val_iou})</span>
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={log.epochs}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" />
                <XAxis dataKey="epoch" stroke="#94A3B8" fontSize={12} />
                <YAxis stroke="#94A3B8" fontSize={12} domain={[0, 1]} />
                <Tooltip contentStyle={{ backgroundColor: "#0F172A", borderColor: "#334155", color: "#F1F5F9" }} />
                <Legend />
                <Line type="monotone" dataKey="train_loss" name="Train Loss" stroke="#F59E0B" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="val_loss" name="Val Loss" stroke="#FB7185" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="val_iou" name="Val IoU" stroke="#06B6D4" strokeWidth={2.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-lg bg-[#0F1420] border border-slate-800 p-5 space-y-3">
          <h2 className="text-base font-semibold text-white">Baseline vs U-Net (Ground-Truth Splits Only)</h2>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={comparisonData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" />
                <XAxis dataKey="split" stroke="#94A3B8" fontSize={11} />
                <YAxis stroke="#94A3B8" fontSize={12} domain={[0, 1]} />
                <Tooltip contentStyle={{ backgroundColor: "#0F172A", borderColor: "#334155", color: "#F1F5F9" }} />
                <Legend />
                <Bar dataKey="Baseline" fill="#64748B" radius={[4, 4, 0, 0]} />
                <Bar dataKey="U-Net ResNet34" fill="#06B6D4" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 rounded-lg bg-[#0F1420] border border-slate-800 overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between">
            <h2 className="text-base font-semibold text-white">STAC Acquisitions Used ({scenesData.scenes.length} items)</h2>
            <span className="text-xs font-mono text-slate-400">Planetary Computer STAC</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#07090E] text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="py-2.5 px-3 font-medium">Scene ID</th>
                  <th className="py-2.5 px-3 font-medium">Collection</th>
                  <th className="py-2.5 px-3 font-medium">Orbit</th>
                  <th className="py-2.5 px-3 font-medium">Role</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {scenesData.scenes.map((sc) => (
                  <tr key={sc.id} className="hover:bg-slate-800/30">
                    <td className="py-2.5 px-3 font-mono text-slate-200">{sc.id}</td>
                    <td className="py-2.5 px-3 font-mono text-cyan-300">{sc.collection}</td>
                    <td className="py-2.5 px-3 text-slate-300">
                      {sc.orbit_state} {sc.relative_orbit ? `#${sc.relative_orbit}` : ""}
                    </td>
                    <td className="py-2.5 px-3 text-slate-300">{sc.role}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-lg bg-[#0F1420] border border-slate-800 p-5 space-y-3">
          <h2 className="text-base font-semibold text-white">SAR & Domain-Shift Limitations</h2>
          <p className="text-xs text-amber-300">{card.metrics.karnataka_inference.note}</p>
          <ul className="space-y-2 text-xs text-slate-300 list-disc pl-4">
            {card.limitations.map((lim, idx) => (
              <li key={idx}>{lim}</li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
};
