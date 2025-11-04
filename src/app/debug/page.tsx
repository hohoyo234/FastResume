"use client";
import React, { useMemo, useState } from "react";
import { computeCoverageSummaryClient, combineExperienceForResumeClient } from "../page";

type WorkItem = {
  role?: string;
  company?: string;
  period?: string;
  bullets: string[];
  volunteer?: boolean;
};

const SAMPLE_JD = `
We are seeking a customer service oriented team member to handle enquiries and quotes,
process orders, maintain inventory records, and communicate with clients via email and phone.
Experience with front desk/reception is a plus.
`;

const RESUME_NO_BULLETS: WorkItem[] = [
  { role: "Customer Service Assistant", company: "ABC Retail", period: "2022 - 2023", bullets: [] },
  { role: "Receptionist", company: "XYZ Clinic", period: "2021 - 2022", bullets: [] },
];

const RESUME_WITH_BULLETS: WorkItem[] = [
  {
    role: "Customer Service Representative",
    company: "Bright Stores",
    period: "2023 - Present",
    bullets: [
      "Handle enquiries and quotes via email and phone",
      "Process orders and update inventory records",
      "Front desk reception and client communication",
    ],
  },
  { role: "Sales Assistant", company: "Market Hub", period: "2021 - 2023", bullets: ["Follow up leads and prepare quotes"] },
];

export default function DebugPage() {
  const [useBullets, setUseBullets] = useState(true);
  const work = useBullets ? RESUME_WITH_BULLETS : RESUME_NO_BULLETS;

  const summary = useMemo(() => computeCoverageSummaryClient(work, SAMPLE_JD), [work]);
  const combined = useMemo(() => combineExperienceForResumeClient(work, summary, 2, 1, SAMPLE_JD), [work, summary]);

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">Debug: Coverage & Matched Work</h1>
      <div className="flex items-center gap-4">
        <button
          className="px-3 py-1 rounded bg-blue-600 text-white"
          onClick={() => setUseBullets(true)}
        >Use resume with bullets</button>
        <button
          className="px-3 py-1 rounded bg-gray-700 text-white"
          onClick={() => setUseBullets(false)}
        >Use resume without bullets</button>
      </div>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold">JD</h2>
        <pre className="bg-gray-100 p-3 rounded whitespace-pre-wrap">{SAMPLE_JD}</pre>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold">Resume Items ({useBullets ? "with bullets" : "no bullets"})</h2>
        <ul className="list-disc pl-5 space-y-2">
          {work.map((w, i) => (
            <li key={i}>
              <div className="font-medium">{w.role} @ {w.company} ({w.period})</div>
              {(w.bullets && w.bullets.length > 0) ? (
                <ul className="list-disc pl-5">
                  {w.bullets.map((b, j) => (<li key={j}>{b}</li>))}
                </ul>
              ) : (
                <div className="text-gray-500">No bullets</div>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold">Coverage Summary (by categories)</h2>
        {summary.items.length === 0 ? (
          <div className="text-gray-600">No categories detected in JD.</div>
        ) : (
          <ul className="divide-y">
            {summary.items.map((it) => (
              <li key={it.key} className="py-2 flex items-center justify-between">
                <div>
                  <div className="font-medium">{it.labelEn} / {it.labelZh}</div>
                  {it.evidence && (
                    <div className="text-sm text-gray-600">
                      Evidence: {it.evidence.role} @ {it.evidence.company} {it.evidence.bullet ? `- ${it.evidence.bullet}` : "(context only)"}
                    </div>
                  )}
                </div>
                <span className={`px-2 py-1 rounded text-white ${it.covered ? "bg-green-600" : "bg-red-600"}`}>{it.covered ? "Covered" : "Gap"}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold">Matched Work (Primary)</h2>
        {combined.primary.length === 0 ? (
          <div className="text-gray-600">No matched experiences</div>
        ) : (
          <ul className="list-disc pl-5">
            {combined.primary.map((w, i) => (
              <li key={i}>
                <div className="font-medium">{w.role} @ {w.company}</div>
                <ul className="list-disc pl-5">
                  {(w.bullets || []).map((b, j) => (<li key={j}>{b}</li>))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}