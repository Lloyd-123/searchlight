"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { extractSicCodes, searchSectors, SectorMatch, sicLabel } from "@/lib/sic";
import type { Company, Thesis } from "./types";

const RESULT_PILL = { pass: ["good", "Pass"], fail: ["bad", "Fail"], unknown: ["warn", "Unknown"] } as const;

// The sectors actually present in the imported list, most common first, as quick picks.
function sectorsIn(companies: Company[]) {
  const counts = new Map<string, number>();
  for (const c of companies) {
    for (const code of extractSicCodes(c.facts.find((f) => f.key === "sic_codes")?.value ?? "")) {
      counts.set(code, (counts.get(code) ?? 0) + 1);
    }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([code, count]) => ({ code, count }));
}

function SectorPicker({ selected, onChange, inList }: {
  selected: string[];
  onChange: (codes: string[]) => void;
  inList: { code: string; count: number }[];
}) {
  const [query, setQuery] = useState("");
  const [aiMatches, setAiMatches] = useState<SectorMatch[] | null>(null);
  const [asking, setAsking] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const matches = useMemo(() => searchSectors(query), [query]);
  const add = (code: string) => {
    if (!selected.includes(code)) onChange([...selected, code]);
  };

  async function askAi() {
    setAsking(true);
    setAiError(null);
    const res = await fetch("/api/sic-suggest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
    });
    const data = await res.json();
    if (res.ok) setAiMatches(data.matches);
    else setAiError(data.error ?? "Suggestion failed.");
    setAsking(false);
  }

  const results = (items: SectorMatch[]) => (
    <div className="sector-results">
      {items.map((m) => (
        <button key={m.code} disabled={selected.includes(m.code)} onClick={() => add(m.code)}>
          <b>{m.code}</b>
          <span>{m.isGroup ? `All of ${m.label}` : m.label}</span>
        </button>
      ))}
    </div>
  );

  return (
    <div>
      <label htmlFor="sector">Target sectors <small>search in plain English, such as plumbing or software</small></label>
      <input
        id="sector"
        type="text"
        value={query}
        placeholder="Search sectors"
        onChange={(e) => { setQuery(e.target.value); setAiMatches(null); setAiError(null); }}
      />
      {query.trim() && (
        <>
          {matches.length > 0 && results(matches)}
          {!aiMatches && (
            <div className="row small" style={{ marginTop: 6 }}>
              <span className="muted">{matches.length ? "Not quite right?" : "No exact wording match."}</span>
              <button className="btn ghost small" disabled={asking} onClick={askAi}>{asking ? "Asking…" : `Ask AI which codes fit “${query.trim()}”`}</button>
            </div>
          )}
          {aiError && <div className="note">{aiError}</div>}
          {aiMatches && (
            <>
              <div className="small muted" style={{ marginTop: 6 }}>AI suggestions</div>
              {aiMatches.length ? results(aiMatches) : <div className="small muted">No codes fit.</div>}
            </>
          )}
        </>
      )}
      {selected.length > 0 && (
        <div className="row" style={{ gap: 6, marginTop: 10 }}>
          {selected.map((code) => (
            <button key={code} className="sector-chip" title="Remove" onClick={() => onChange(selected.filter((s) => s !== code))}>
              {code} {sicLabel(code)} ×
            </button>
          ))}
        </div>
      )}
      {inList.length > 0 && (
        <div className="small" style={{ marginTop: 10 }}>
          <div className="muted" style={{ marginBottom: 4 }}>In your list:</div>
          <div className="row" style={{ gap: 6 }}>
            {inList.filter((s) => !selected.includes(s.code)).slice(0, 12).map((s) => (
              <button key={s.code} className="btn ghost small" onClick={() => add(s.code)}>
                {sicLabel(s.code)} ({s.count})
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function ShortlistPanel({ companies, refresh }: { companies: Company[]; refresh: () => Promise<void> }) {
  const [thesis, setThesis] = useState<Thesis | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/settings").then((r) => r.json()).then((s) => setThesis(s.thesis));
  }, []);

  async function save(next: Thesis) {
    setThesis(next);
    await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ thesis: next }),
    });
    await refresh();
  }

  const numberField = (v: string) => (v === "" ? null : Math.max(0, Number(v)));

  const enriched = useMemo(() => companies.filter((c) => c.status === "enriched"), [companies]);
  const ranked = useMemo(() => [...enriched].sort((a, b) => b.score.total - a.score.total), [enriched]);
  const shortlist = ranked.filter((c) => c.score.shortlisted);
  const filtered = ranked.filter((c) => !c.score.shortlisted);
  const sectors = useMemo(() => sectorsIn(enriched), [enriched]);

  if (!thesis) return <div className="panel muted">Loading thesis…</div>;

  return (
    <>
      <div className="panel">
        <h2>Thesis</h2>
        <p className="lede">Your filters decide who makes the shortlist. Missing data never rules a company out: it shows as unknown.</p>
        <div className="grid2">
          <SectorPicker selected={thesis.sicCodes} onChange={(sicCodes) => save({ ...thesis, sicCodes })} inList={sectors} />
          <div className="row" style={{ alignItems: "flex-start" }}>
            <div style={{ flex: 1 }}>
              <label htmlFor="minco">Min company age <small>years</small></label>
              <input id="minco" type="number" min={0} value={thesis.minCompanyAge ?? ""} onChange={(e) => save({ ...thesis, minCompanyAge: numberField(e.target.value) })} />
            </div>
            <div style={{ flex: 1 }}>
              <label htmlFor="minown">Min owner age <small>years</small></label>
              <input id="minown" type="number" min={0} value={thesis.minOwnerAge ?? ""} onChange={(e) => save({ ...thesis, minOwnerAge: numberField(e.target.value) })} />
            </div>
            <div style={{ flex: 1 }}>
              <label htmlFor="maxown">Max owner age <small>years</small></label>
              <input id="maxown" type="number" min={0} value={thesis.maxOwnerAge ?? ""} onChange={(e) => save({ ...thesis, maxOwnerAge: numberField(e.target.value) })} />
            </div>
          </div>
        </div>
        <label className="row small" style={{ marginTop: 12, marginBottom: 0, fontWeight: 400 }}>
          <input type="checkbox" checked={thesis.activeOnly} onChange={(e) => save({ ...thesis, activeOnly: e.target.checked })} />
          Active companies only: no dissolved, liquidation, strike-off or insolvency history
        </label>
        <label className="row small" style={{ marginTop: 6, marginBottom: 0, fontWeight: 400 }}>
          <input type="checkbox" checked={thesis.excludeAcquired} onChange={(e) => save({ ...thesis, excludeAcquired: e.target.checked })} />
          Filter out likely acquired or merged companies: corporate parent, subsidiary accounts, or a control change in the last 3 years
        </label>
        <label className="row small" style={{ marginTop: 6, marginBottom: 0, fontWeight: 400 }}>
          <input type="checkbox" checked={thesis.excludeMicro} onChange={(e) => save({ ...thesis, excludeMicro: e.target.checked })} />
          Filter out companies filing micro-entity or dormant accounts
        </label>
      </div>

      <div className="panel table-wrap">
        <h2>Shortlist <span className="pill accent">{shortlist.length} of {enriched.length}</span></h2>
        {!enriched.length && <p className="muted">Enrich some companies first.</p>}
        <RankTable rows={shortlist} expanded={expanded} setExpanded={setExpanded} />
      </div>

      {filtered.length > 0 && (
        <div className="panel table-wrap">
          <h2>Filtered out <span className="pill">{filtered.length}</span></h2>
          <RankTable rows={filtered} expanded={expanded} setExpanded={setExpanded} showReason />
        </div>
      )}
    </>
  );
}

function RankTable({ rows, expanded, setExpanded, showReason }: {
  rows: Company[];
  expanded: number | null;
  setExpanded: (id: number | null) => void;
  showReason?: boolean;
}) {
  if (!rows.length) return null;
  return (
    <table>
      <thead>
        <tr><th>Score</th><th>Company</th><th>Owner</th><th>{showReason ? "Why filtered" : "Factors"}</th></tr>
      </thead>
      <tbody>
        {rows.map((c) => (
          <Fragment key={c.id}>
            <tr className="clickable" onClick={() => setExpanded(expanded === c.id ? null : c.id)}>
              <td className="score">{c.score.total}</td>
              <td>{c.companyName}<div className="small muted">{c.companyNumber}</div></td>
              <td className="small">{c.owner ? <>{c.owner.name}<div className="muted">Age {c.owner.ageBand}</div></> : <span className="muted">Unknown</span>}</td>
              <td className="small">
                {showReason
                  ? c.score.filteredBecause.map((r, i) => <div key={i}>{r}</div>)
                  : c.score.factors.map((f) => <span key={f.name} className={`pill ${RESULT_PILL[f.result][0]}`} style={{ marginRight: 4 }}>{f.name}</span>)}
              </td>
            </tr>
            {expanded === c.id && (
              <tr>
                <td colSpan={4}>
                  <div className="detail">
                    {c.score.knockouts.map((k) => <div key={k} className="note">Ruled out: {k}</div>)}
                    {c.score.factors.map((f) => (
                      <div className="factor" key={f.name}>
                        <span className={`pill ${RESULT_PILL[f.result][0]}`}>{RESULT_PILL[f.result][1]}</span>
                        <span><strong>{f.name}.</strong> {f.detail}</span>
                        <span className="muted">{f.points}/{f.max}</span>
                      </div>
                    ))}
                  </div>
                </td>
              </tr>
            )}
          </Fragment>
        ))}
      </tbody>
    </table>
  );
}
