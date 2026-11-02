"use client";

import Papa from "papaparse";
import { Fragment, useEffect, useRef, useState } from "react";
import type { Company } from "./types";

const HEADER_MAP: Record<string, string> = {
  name: "name", company: "name", "company name": "name", companyname: "name", "business name": "name",
  number: "number", "company number": "number", companynumber: "number", "company no": "number", "company no.": "number", "crn": "number",
  website: "website", url: "website", site: "website", domain: "website", "web site": "website",
  owner: "owner", "owner name": "owner", ownername: "owner", contact: "owner", "contact name": "owner", director: "owner",
  email: "email", "e-mail": "email", "email address": "email", "owner email": "email",
};

const columnKey = (header: string) => {
  const key = header.replace(/^﻿/, "").trim().toLowerCase();
  return HEADER_MAP[key] ?? key;
};

const METHOD_LABEL: Record<string, string> = {
  number: "Company number",
  exact: "Exact name",
  haiku: "AI match",
  user: "Confirmed by you",
};

function StatusPill({ c }: { c: Company }) {
  const map: Record<Company["status"], [string, string]> = {
    pending: ["", "Queued"],
    processing: ["accent", "Working…"],
    enriched: ["good", "Enriched"],
    needs_confirm: ["warn", "Needs your confirmation"],
    no_match: ["bad", "No match"],
    error: ["bad", "Error"],
  };
  const [cls, label] = map[c.status];
  return <span className={`pill ${cls}`}>{label}</span>;
}

export function ImportPanel({ companies, refresh }: { companies: Company[]; refresh: () => Promise<void> }) {
  const [message, setMessage] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);
  const looping = useRef(false);

  const open = companies.filter((c) => c.status === "pending" || c.status === "processing").length;
  const done = companies.length - open;
  const pct = companies.length ? Math.round((done / companies.length) * 100) : 0;

  // Drives the batches from the browser. It restarts after a refresh because queued rows are still in the database.
  useEffect(() => {
    if (!open || looping.current) return;
    looping.current = true;
    (async () => {
      try {
        const poll = setInterval(refresh, 1500);
        try {
          for (;;) {
            const res = await fetch("/api/process", { method: "POST" });
            if (!res.ok) {
              setMessage("Processing stopped: the server returned an error. Refresh to resume.");
              break;
            }
            const { remaining } = await res.json();
            await refresh();
            if (!remaining) break;
          }
        } finally {
          clearInterval(poll);
        }
      } finally {
        looping.current = false;
      }
    })();
  }, [open, refresh]);

  async function importRows(fields: string[], rows: Record<string, string>[]) {
    if (!fields.includes("name")) {
      setMessage(`No company name column found. Columns seen: ${fields.join(", ") || "none"}.`);
      return;
    }
    const res = await fetch("/api/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rows }),
    });
    const data = await res.json();
    setMessage(res.ok ? `Imported ${data.imported} rows${data.skipped ? `, skipped ${data.skipped} with no name` : ""}.` : data.error);
    await refresh();
  }

  async function onExcel(file: File) {
    try {
      const { readSheet } = await import("read-excel-file/browser");
      const sheet = await readSheet(file);
      const cell = (v: unknown) => (v === null || v === undefined ? "" : String(v).trim());
      // Reads the first sheet. Headers are the first row with anything in it.
      const headerAt = sheet.findIndex((row) => row.some((v) => cell(v)));
      if (headerAt < 0) {
        setMessage("That spreadsheet's first sheet is empty.");
        return;
      }
      const fields = sheet[headerAt].map((v) => columnKey(cell(v)));
      const rows = sheet
        .slice(headerAt + 1)
        .filter((row) => row.some((v) => cell(v)))
        .map((row) => Object.fromEntries(fields.map((f, i) => [f, cell(row[i])])));
      await importRows(fields, rows);
    } catch (e) {
      setMessage(`Could not read that spreadsheet: ${e instanceof Error ? e.message : "unknown error"}`);
    }
  }

  function onFile(file: File) {
    if (/\.xls$/i.test(file.name)) {
      setMessage("Older .xls files aren't supported. In Excel, save it as .xlsx or CSV first.");
      return;
    }
    if (/\.xlsx$/i.test(file.name)) {
      onExcel(file);
      return;
    }
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: columnKey,
      complete: (result) => importRows(result.meta.fields ?? [], result.data),
      error: (e) => setMessage(`Could not read that file: ${e.message}`),
    });
  }

  async function confirm(id: number, body: object) {
    const res = await fetch(`/api/companies/${id}/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) setMessage((await res.json()).error ?? "That did not work.");
    await refresh();
  }

  async function reset() {
    if (!window.confirm("Delete all companies, facts and letters?")) return;
    await fetch("/api/companies", { method: "DELETE" });
    setMessage(null);
    await refresh();
  }

  return (
    <>
      <div className="panel">
        <div className="row spread">
          <div>
            <h2>Import targets</h2>
            <p className="lede">
              Excel or CSV file with a company name column. Company number, website, owner name and email are optional. A company number skips name matching.
            </p>
          </div>
          {companies.length > 0 && <button className="btn ghost small" onClick={reset}>Clear all</button>}
        </div>
        <div className="drop">
          <input
            type="file"
            accept=".xlsx,.xls,.csv,text/csv"
            aria-label="Choose Excel or CSV file"
            onChange={(e) => {
              if (e.target.files?.[0]) onFile(e.target.files[0]);
              // Lets the same file be chosen again after "Clear all".
              e.target.value = "";
            }}
          />
        </div>
        {message && <p className="small" role="status">{message}</p>}
        {companies.length > 0 && (
          <>
            <div className="progress"><div style={{ width: `${pct}%` }} /></div>
            <div className="small muted">
              {done} of {companies.length} processed{open ? " · pacing requests to stay within the Companies House limit" : ""}
            </div>
          </>
        )}
      </div>

      {companies.length > 0 && (
        <div className="panel table-wrap">
          <table>
            <thead>
              <tr><th>From your CSV</th><th>Status</th><th>Matched to</th><th>How</th><th>Owner</th></tr>
            </thead>
            <tbody>
              {companies.map((c) => (
                <Fragment key={c.id}>
                  <tr className="clickable" onClick={() => setExpanded(expanded === c.id ? null : c.id)}>
                    <td>
                      {c.csvName}
                      {c.statusNote && <div className="note">{c.statusNote}</div>}
                    </td>
                    <td><StatusPill c={c} /></td>
                    <td>{c.companyName ?? <span className="muted">—</span>}{c.companyNumber && <div className="small muted">{c.companyNumber}</div>}</td>
                    <td className="small">{c.matchMethod ? METHOD_LABEL[c.matchMethod] : <span className="muted">—</span>}</td>
                    <td className="small">
                      {c.owner ? <>{c.owner.name}<div className="muted">Age {c.owner.ageBand}</div></> : <span className="muted">—</span>}
                    </td>
                  </tr>
                  {c.status === "needs_confirm" && (
                    <tr>
                      <td colSpan={5}>
                        <div className="detail">
                          <strong>Which company is “{c.csvName}”?</strong>
                          <div className="small muted">
                            Model confidence: {c.matchConfidence}. {c.matchReason}
                          </div>
                          {c.candidates?.slice(0, 6).map((cand) => (
                            <div key={cand.number} className={`cand ${cand.number === c.suggestedNumber ? "suggested" : ""}`}>
                              <div className="small">
                                <strong>{cand.title}</strong> · {cand.number} · {cand.status}
                                {cand.created && <> · inc. {cand.created}</>}
                                <div className="muted">{cand.address}</div>
                              </div>
                              <button className="btn small" onClick={() => confirm(c.id, { companyNumber: cand.number })}>Use this</button>
                            </div>
                          ))}
                          <div className="row" style={{ marginTop: 8 }}>
                            <button className="btn ghost small" onClick={() => confirm(c.id, { companyNumber: null })}>None of these</button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                  {c.status === "error" && (
                    <tr>
                      <td colSpan={5}>
                        <button className="btn ghost small" onClick={() => confirm(c.id, { retry: true })}>Retry this row</button>
                      </td>
                    </tr>
                  )}
                  {expanded === c.id && c.status === "enriched" && <CompanyDetail c={c} />}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function CompanyDetail({ c }: { c: Company }) {
  return (
    <tr>
      <td colSpan={5}>
        <div className="detail grid2">
          <div>
            <h3>Stored facts</h3>
            {c.facts.map((f) => (
              <div className="fact" key={f.key}>
                <span>{f.label}</span>
                <span>
                  {f.value}{" "}
                  {f.sourceUrl ? <a href={f.sourceUrl} target="_blank" rel="noreferrer">source</a> : <em className="muted">{f.sourceType}</em>}
                </span>
              </div>
            ))}
            <p className="small muted">Match: {c.matchReason}</p>
          </div>
          <div>
            <h3>People</h3>
            {c.people.length === 0 && <p className="small muted">No active directors or PSCs listed.</p>}
            {c.people.map((p, i) => (
              <div className="fact" key={i}>
                <span>
                  {p.kind === "psc" ? "PSC" : p.kind === "corporate_psc" ? "Corporate PSC" : "Director"}
                  {p.ownershipBand ? ` · ${p.ownershipBand}` : ""}
                </span>
                <span>
                  {p.name}{p.ageBand ? ` · ${p.ageBand}` : ""}{" "}
                  {p.sourceUrl && <a href={p.sourceUrl} target="_blank" rel="noreferrer">source</a>}
                </span>
              </div>
            ))}
            {c.owner && <p className="small"><strong>Treated as owner:</strong> {c.owner.name}. {c.owner.basis}.</p>}
          </div>
        </div>
      </td>
    </tr>
  );
}
