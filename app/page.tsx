"use client";

import { useCallback, useEffect, useState } from "react";
import { ImportPanel } from "@/components/ImportPanel";
import { LettersPanel } from "@/components/LettersPanel";
import { ShortlistPanel } from "@/components/ShortlistPanel";
import { WebsitePanel } from "@/components/WebsitePanel";
import type { Company } from "@/components/types";

const STEPS = ["Import & enrich", "Shortlist", "Website check", "Message builder"] as const;

export default function Home() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState(0);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/companies");
    if (!res.ok) {
      setError("Could not load companies from the server.");
      return;
    }
    const data = await res.json();
    setError(null);
    setCompanies(data.companies);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const counts = [
    companies.length,
    companies.filter((c) => c.score.shortlisted).length,
    companies.filter((c) => c.score.shortlisted && c.checks.length).length,
    companies.filter((c) => c.selected).length,
  ];

  return (
    <div className="shell">
      <div className="brand">
        <h1>Searchlight</h1>
        <span>Find and approach UK SME owners who might sell</span>
      </div>
      <nav className="steps">
        {STEPS.map((label, i) => (
          <button key={label} className={step === i ? "active" : ""} onClick={() => setStep(i)}>
            {i + 1}. {label}{counts[i] ? <b>{counts[i]}</b> : null}
          </button>
        ))}
      </nav>
      {error && <div className="err">{error}</div>}
      {/* The import panel stays mounted so its batch loop keeps running while you browse other steps. */}
      <div hidden={step !== 0}><ImportPanel companies={companies} refresh={refresh} /></div>
      {step === 1 && <ShortlistPanel companies={companies} refresh={refresh} />}
      {step === 2 && <WebsitePanel companies={companies} refresh={refresh} />}
      {step === 3 && <LettersPanel companies={companies} refresh={refresh} />}
    </div>
  );
}
