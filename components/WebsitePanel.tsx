"use client";

import { useEffect, useState } from "react";
import type { Company } from "./types";

const ANSWER_PILL = { yes: "good", no: "bad", unclear: "warn" } as const;

export function WebsitePanel({ companies, refresh }: { companies: Company[]; refresh: () => Promise<void> }) {
  const [criteriaText, setCriteriaText] = useState("");
  const [running, setRunning] = useState<Set<number>>(new Set());
  const [message, setMessage] = useState<string | null>(null);

  const shortlist = companies
    .filter((c) => c.score.shortlisted)
    .sort((a, b) => b.score.total - a.score.total);

  useEffect(() => {
    fetch("/api/settings").then((r) => r.json()).then((s) => setCriteriaText(s.criteria.join("\n")));
  }, []);

  const criteria = () => criteriaText.split("\n").map((s) => s.trim()).filter(Boolean);

  async function saveCriteria() {
    await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ criteria: criteria() }),
    });
  }

  async function runOne(id: number) {
    setRunning((s) => new Set(s).add(id));
    const res = await fetch(`/api/companies/${id}/website`, { method: "POST" });
    if (!res.ok) setMessage((await res.json()).error ?? "Check failed.");
    setRunning((s) => {
      const next = new Set(s);
      next.delete(id);
      return next;
    });
    await refresh();
  }

  async function runAll() {
    if (!criteria().length) {
      setMessage("Add at least one criterion first.");
      return;
    }
    setMessage(null);
    await saveCriteria();
    for (const c of shortlist) await runOne(c.id);
  }

  async function patch(id: number, body: object) {
    await fetch(`/api/companies/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    await refresh();
  }

  return (
    <>
      <div className="panel">
        <h2>Website check</h2>
        <p className="lede">Shortlisted companies only. Every yes or no must come with a quote found on the site; anything else is unclear.</p>
        <label htmlFor="criteria">Criteria <small>one per line</small></label>
        <textarea id="criteria" rows={3} value={criteriaText} placeholder={"Family-owned\nSells to other businesses (B2B)"} onChange={(e) => setCriteriaText(e.target.value)} onBlur={saveCriteria} />
        <div className="row" style={{ marginTop: 10 }}>
          <button className="btn accent" onClick={runAll} disabled={running.size > 0 || !shortlist.length}>
            {running.size ? "Checking…" : `Check ${shortlist.length} websites`}
          </button>
          {message && <span className="small note" role="status">{message}</span>}
        </div>
      </div>

      {shortlist.map((c) => (
        <div className="panel" key={c.id}>
          <div className="row spread">
            <div>
              <strong>{c.companyName}</strong> <span className="pill accent">{c.score.total}</span>
              {running.has(c.id) && <span className="pill accent" style={{ marginLeft: 6 }}>Checking…</span>}
            </div>
            <label className="row small" style={{ fontWeight: 400, marginBottom: 0 }}>
              <input type="checkbox" checked={c.selected} onChange={(e) => patch(c.id, { selected: e.target.checked })} />
              Select for a letter
            </label>
          </div>
          <div className="row small" style={{ margin: "8px 0" }}>
            <input
              key={c.website ?? ""}
              type="text"
              aria-label={`Website for ${c.companyName}`}
              defaultValue={c.website ?? ""}
              placeholder="No website on file: add one"
              style={{ flex: 1, minWidth: 200 }}
              onBlur={(e) => { if (e.target.value.trim() !== (c.website ?? "")) patch(c.id, { website: e.target.value }); }}
            />
            <button className="btn ghost small" disabled={running.has(c.id)} onClick={async () => { await saveCriteria(); await runOne(c.id); }}>Check</button>
          </div>
          {c.websiteNote && <div className="note">{c.websiteNote}</div>}
          {c.checks.map((w) => (
            <div className="factor" key={w.criterion} style={{ gridTemplateColumns: "70px 1fr" }}>
              <span className={`pill ${ANSWER_PILL[w.answer]}`}>{w.answer}</span>
              <div>
                <strong>{w.criterion}</strong>
                {w.snippet && <blockquote>“{w.snippet}” {w.sourceUrl && <a href={w.sourceUrl} target="_blank" rel="noreferrer">source</a>}</blockquote>}
                {w.note && !c.websiteNote && <div className="note">{w.note}</div>}
              </div>
            </div>
          ))}
          {c.details.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <h3>Details for the letter</h3>
              {c.details.map((d, i) => (
                <blockquote key={i} style={{ marginBottom: 6 }}>
                  <strong>{d.topic}:</strong> “{d.snippet}” {d.sourceUrl && <a href={d.sourceUrl} target="_blank" rel="noreferrer">source</a>}
                </blockquote>
              ))}
            </div>
          )}
        </div>
      ))}
      {!shortlist.length && <div className="panel muted">Nothing on the shortlist yet.</div>}
    </>
  );
}
