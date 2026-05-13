import React from 'react';
import { motion } from 'framer-motion';
import Card from '../../ui/Card';

const INSIGHTS = [
  {
    title: 'Demand forecasting',
    score: 0.82,
    body: 'Bayesian smoothing over 90-day velocity; confidence intervals tighten with branch-level seasonality.',
  },
  {
    title: 'Smart reorder',
    score: 0.76,
    body: 'Safety stock + lead-time jitter model; escalates SKU exceptions to procurement workflow.',
  },
  {
    title: 'Profitability heatmap',
    score: 0.71,
    body: 'Margin cubes by category × branch; highlights negative contribution baskets.',
  },
  {
    title: 'Fraud detection',
    score: 0.64,
    body: 'Velocity + void correlation signals; routes to audit queue with explainable factors.',
  },
  {
    title: 'Revenue forecast',
    score: 0.79,
    body: 'ETS + exogenous regressors (footfall proxy, promos); outputs guard-banded reforecast windows.',
  },
  {
    title: 'Seasonal trends',
    score: 0.68,
    body: 'STL decomposition with holiday regressors; surfaces uplift opportunities.',
  },
  {
    title: 'AI recommendations',
    score: 0.74,
    body: 'Policy layer merges guardrails (min margin, stock-out risk) before surfacing actions.',
  },
];

const AIInsightsPanel: React.FC = () => {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold tracking-tight text-[#0B2A5B] dark:text-slate-100">AI insights</h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Mock scoring layer — swap with your model serving endpoint and feature store contracts.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {INSIGHTS.map((it, i) => (
          <motion.div
            key={it.title}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.04 }}
          >
            <Card className="h-full border border-slate-200/80 bg-gradient-to-br from-white/95 to-indigo-50/40 backdrop-blur-md dark:border-slate-700 dark:from-slate-950/90 dark:to-indigo-950/30">
              <p className="text-sm font-bold text-slate-900 dark:text-slate-50">{it.title}</p>
              <p className="mt-2 text-xs leading-relaxed text-slate-600 dark:text-slate-400">{it.body}</p>
              <div className="mt-4 flex items-center gap-2">
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[#0047AB] to-indigo-400"
                    style={{ width: `${Math.round(it.score * 100)}%` }}
                  />
                </div>
                <span className="text-xs font-semibold tabular-nums text-slate-700 dark:text-slate-200">
                  {(it.score * 100).toFixed(0)}%
                </span>
              </div>
            </Card>
          </motion.div>
        ))}
      </div>
    </div>
  );
};

export default AIInsightsPanel;
