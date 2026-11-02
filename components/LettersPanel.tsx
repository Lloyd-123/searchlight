"use client";

import { Fragment, ReactNode, useEffect, useRef, useState } from "react";
import { parseTemplate, Segment, TAGS } from "@/lib/template";
import type { Claim, Company, Generated, Operator, Template } from "./types";

const FIELDS: [keyof Operator, string, string][] = [
  ["name", "Your name", "Jane Doe"],
  ["fund", "Fund or firm", "Northbridge Partners"],
  ["contact", "Contact details", "jane@example.com · 07700 900000"],
  ["background", "Your background", "Ten years running operations at a UK manufacturer"],
  ["whyBuying", "Why you want to buy a business", "To take on and run one good business for the long term"],
];

const json = (body: unknown) => ({ headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

function SyntaxPreview({ source }: { source: string }) {
  const render = (s: Segment, key: number): ReactNode => {
    if (s.type === "text") return <Fragment key={key}>{s.text}</Fragment>;
    if (s.type === "tag") return <span key={key} className={s.name ? "syn-tag" : "syn-bad"}>[{s.raw}]</span>;
    return <span key={key} className="syn-ai">{"{"}{s.parts.map(render)}{"}"}</span>;
  };
  return <div className="syntax">{parseTemplate(source).segments.map(render)}</div>;
}

function Highlighted({ body, claims }: { body: string; claims: Claim[] }) {
  const lower = body.toLowerCase();
  const spans = claims
    .flatMap((cl) => {
      const start = lower.indexOf(cl.quote.toLowerCase());
      return start < 0 ? [] : [{ start, end: start + cl.quote.length, ok: cl.supported }];
    })
    // Where quotes overlap, the unsupported one wins so a problem is never hidden.
    .sort((a, b) => a.start - b.start || Number(a.ok) - Number(b.ok));
  const parts: ReactNode[] = [];
  let at = 0;
  spans.forEach((s, i) => {
    if (s.start < at) return;
    parts.push(body.slice(at, s.start));
    parts.push(<mark key={i} className={s.ok ? "ok" : "bad"}>{body.slice(s.start, s.end)}</mark>);
    at = s.end;
  });
  parts.push(body.slice(at));
  return <div className="letter">{parts}</div>;
}

function ClaimRow({ cl }: { cl: Claim }) {
  return (
    <div className={`claim ${cl.supported ? "" : "bad"}`}>
      <strong>“{cl.quote}”</strong>
      {(!cl.supported || cl.facts.length === 0) && <div>{cl.reason}</div>}
      {cl.facts.map((f) => (
        <div key={f.id} className="muted">
          {f.label}: {f.value} {f.sourceUrl && <a href={f.sourceUrl} target="_blank" rel="noreferrer">source</a>}
        </div>
      ))}
    </div>
  );
}

function ClaimList({ claims }: { claims: Claim[] }) {
  return (
    <>
      {claims.length === 0 && <p className="small muted">No factual claims found.</p>}
      {claims.filter((c) => !c.supported).map((c, i) => <ClaimRow key={`u${i}`} cl={c} />)}
      {claims.filter((c) => c.supported).map((c, i) => <ClaimRow key={`s${i}`} cl={c} />)}
    </>
  );
}

export function LettersPanel({ companies, refresh }: { companies: Company[]; refresh: () => Promise<void> }) {
  const [operator, setOperator] = useState<Operator>({});
  const [templates, setTemplates] = useState<Template[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [draft, setDraft] = useState({ name: "", subject: "", body: "" });
  const [saved, setSaved] = useState(true);
  const [testCompany, setTestCompany] = useState<number | null>(null);
  const [runs, setRuns] = useState<Generated[]>([]);
  const [runIndex, setRunIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const enriched = companies.filter((c) => c.status === "enriched");
  const shortlist = enriched.filter((c) => c.score.shortlisted).sort((a, b) => b.score.total - a.score.total);
  const pickable = shortlist.length ? shortlist : enriched;
  const selected = enriched.filter((c) => c.selected);
  const testId = testCompany ?? pickable[0]?.id ?? null;

  function open(t: Template) {
    setActiveId(t.id);
    setDraft({ name: t.name, subject: t.subject, body: t.body });
    setSaved(true);
    setRuns([]);
  }

  useEffect(() => {
    fetch("/api/settings").then((r) => r.json()).then((s) => setOperator(s.operator));
    fetch("/api/templates").then((r) => r.json()).then((d) => {
      setTemplates(d.templates);
      if (d.templates[0]) open(d.templates[0]);
    });
  }, []);

  function edit(patch: Partial<typeof draft>) {
    setDraft((d) => ({ ...d, ...patch }));
    setSaved(false);
  }

  async function save() {
    if (activeId === null) return;
    await fetch(`/api/templates/${activeId}`, { method: "PUT", ...json(draft) });
    setTemplates((ts) => ts.map((t) => (t.id === activeId ? { ...t, ...draft } : t)));
    setSaved(true);
  }

  async function create(from?: typeof draft) {
    if (!saved) await save();
    const res = await fetch("/api/templates", { method: "POST", ...json(from ? { ...from, name: `${from.name} (copy)` } : { name: "New template", subject: "", body: "Hi [first name],\n\n" }) });
    const { template } = await res.json();
    setTemplates((ts) => [...ts, template]);
    open(template);
  }

  async function remove() {
    if (activeId === null || templates.length <= 1) return;
    if (!window.confirm(`Delete “${draft.name}”?`)) return;
    await fetch(`/api/templates/${activeId}`, { method: "DELETE" });
    const rest = templates.filter((t) => t.id !== activeId);
    setTemplates(rest);
    open(rest[0]);
  }

  async function switchTo(id: number) {
    if (!saved) await save();
    const t = templates.find((x) => x.id === id);
    if (t) open(t);
  }

  function insertTag(tag: string) {
    const el = bodyRef.current;
    const at = el?.selectionStart ?? draft.body.length;
    const end = el?.selectionEnd ?? at;
    const text = `[${tag}]`;
    edit({ body: draft.body.slice(0, at) + text + draft.body.slice(end) });
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(at + text.length, at + text.length);
    });
  }

  async function generate() {
    if (testId === null) return;
    setBusy(true);
    setError(null);
    await save();
    const res = await fetch("/api/templates/preview", { method: "POST", ...json({ companyId: testId, subject: draft.subject, body: draft.body }) });
    const data = await res.json();
    if (!res.ok) setError(data.error ?? "Generation failed.");
    else {
      setRunIndex(runs.length);
      setRuns([...runs, data]);
    }
    setBusy(false);
  }

  function saveOperator() {
    fetch("/api/settings", { method: "PUT", ...json({ operator }) });
  }

  const { errors } = parseTemplate(draft.body);
  const subjectParsed = parseTemplate(draft.subject);
  const allErrors = [
    ...errors,
    ...subjectParsed.errors,
    ...(subjectParsed.segments.some((s) => s.type === "ai") ? ["AI sections work in the message, not the subject"] : []),
  ];
  const run = runs[runIndex];

  return (
    <>
      <div className="panel">
        <details>
          <summary><strong>Your details</strong> <span className="muted small">used by the [my …] details. {operator.name || "Add your name"}</span></summary>
          <div className="grid2" style={{ marginTop: 12 }}>
            {FIELDS.map(([key, label, placeholder]) => (
              <div key={key}>
                <label htmlFor={key}>{label}</label>
                <input id={key} type="text" value={operator[key] ?? ""} placeholder={placeholder} onChange={(e) => setOperator({ ...operator, [key]: e.target.value })} onBlur={saveOperator} />
              </div>
            ))}
          </div>
        </details>
      </div>

      <div className="panel">
        <div className="row spread">
          <h2>Message builder</h2>
          <div className="row">
            <select aria-label="Choose template" value={activeId ?? ""} onChange={(e) => switchTo(Number(e.target.value))}>
              {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <button className="btn ghost small" onClick={() => create()}>New</button>
            <button className="btn ghost small" onClick={() => create(draft)}>Duplicate</button>
            <button className="btn ghost small" disabled={templates.length <= 1} onClick={remove}>Delete</button>
          </div>
        </div>
        <p className="lede small">
          Plain text is sent word for word. <span className="syn-tag">[details]</span> fill in stored facts exactly.{" "}
          <span className="syn-ai">{"{curly brackets}"}</span> are rewritten by AI: put in rough wording or an instruction, and it can only use researched facts.
        </p>

        <div className="grid2">
          <div>
            <label htmlFor="tname">Template name</label>
            <input id="tname" type="text" value={draft.name} onChange={(e) => edit({ name: e.target.value })} onBlur={save} />
          </div>
          <div>
            <label htmlFor="tsubject">Subject</label>
            <input id="tsubject" type="text" value={draft.subject} onChange={(e) => edit({ subject: e.target.value })} onBlur={save} />
          </div>
        </div>

        <label htmlFor="tbody" style={{ marginTop: 12 }}>Message <small>{saved ? "Saved" : "Unsaved changes"}</small></label>
        <textarea id="tbody" ref={bodyRef} rows={12} value={draft.body} onChange={(e) => edit({ body: e.target.value })} onBlur={save} />
        <div className="row small" style={{ gap: 6, marginTop: 8 }}>
          <span className="muted">Insert:</span>
          {TAGS.map((t) => (
            <button key={t.name} className="btn ghost small" title={t.hint} onClick={() => insertTag(t.name)}>{t.name}</button>
          ))}
        </div>
        {allErrors.map((e) => <div key={e} className="note">{e}</div>)}
        <h3 style={{ marginTop: 14 }}>How this reads</h3>
        <SyntaxPreview source={draft.body} />
      </div>

      <div className="panel">
        <div className="row spread">
          <h2>Example generation</h2>
          <div className="row">
            <select aria-label="Company to test with" value={testId ?? ""} onChange={(e) => setTestCompany(Number(e.target.value))}>
              {pickable.map((c) => <option key={c.id} value={c.id}>{c.companyName}</option>)}
            </select>
            <button className="btn accent" disabled={busy || testId === null || allErrors.length > 0} onClick={generate}>
              {busy ? "Generating and checking…" : runs.length ? "Generate again" : "Generate example"}
            </button>
          </div>
        </div>
        <p className="lede small">Test runs save nothing. Edit the template above and generate again until you&apos;re happy. Run the website check first for richer detail.</p>
        {error && <div className="err">{error}</div>}
        {!pickable.length && <p className="muted">Import some companies first.</p>}
        {run && (
          <>
            <div className="row small" style={{ marginBottom: 10 }}>
              <button className="btn ghost small" disabled={runIndex === 0} onClick={() => setRunIndex(runIndex - 1)}>Previous</button>
              <span className="muted">Version {runIndex + 1} of {runs.length}</span>
              <button className="btn ghost small" disabled={runIndex === runs.length - 1} onClick={() => setRunIndex(runIndex + 1)}>Next</button>
              {run.status === "passed" ? <span className="pill good">All claims supported</span> : <span className="pill bad">{run.claims.filter((c) => !c.supported).length} unsupported</span>}
            </div>
            {run.note && <div className="note" style={{ marginBottom: 8 }}><strong>For you, not in the message:</strong> {run.note}</div>}
            {run.missing.map((m) => <div key={m} className="note">Missing: {m}</div>)}
            <div className="grid2" style={{ marginTop: 8 }}>
              <div>
                <div className="small" style={{ marginBottom: 6 }}><strong>Subject:</strong> {run.subject}</div>
                <Highlighted body={run.body} claims={run.claims} />
              </div>
              <div>
                <h3>Claim check</h3>
                <ClaimList claims={run.claims} />
              </div>
            </div>
          </>
        )}
      </div>

      <div className="panel">
        <h2>Outreach list <span className="pill accent">{selected.length}</span></h2>
        <p className="lede small">
          Tick companies in the website step, then generate from “{draft.name}”. Sending isn&apos;t connected yet: copy the message and mark it as contacted. A live version would send through your email account.
        </p>
        {!selected.length && <p className="muted small">No companies selected yet.</p>}
        {selected.map((c) => <LetterCard key={c.id} c={c} refresh={refresh} template={draft} canGenerate={allErrors.length === 0} />)}
      </div>
    </>
  );
}

function LetterCard({ c, refresh, template, canGenerate }: {
  c: Company;
  refresh: () => Promise<void>;
  template: { subject: string; body: string };
  canGenerate: boolean;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  const [copied, setCopied] = useState(false);
  const letter = c.letter;
  const email = c.facts.find((f) => f.key === "csv_email")?.value;

  async function act(action: string, extra: object = {}) {
    const res = await fetch(`/api/companies/${c.id}/letter`, { method: "POST", ...json({ action, ...extra }) });
    const data = await res.json();
    await refresh();
    return { res, data };
  }

  async function run(label: string, action: string, extra: object = {}) {
    setBusy(label);
    setError(null);
    const { res, data } = await act(action, extra);
    if (!res.ok) setError(data.error ?? "That failed.");
    setBusy(null);
    return res.ok;
  }

  async function generateAndCheck() {
    if (await run("Generating…", "draft", { subject: template.subject, body: template.body })) await run("Checking claims…", "validate");
  }

  async function saveEdit() {
    setBusy("Saving…");
    await fetch(`/api/companies/${c.id}/letter`, { method: "PUT", ...json({ body: text }) });
    setEditing(false);
    await refresh();
    await run("Checking claims…", "validate");
  }

  async function copy() {
    if (!letter) return;
    await navigator.clipboard.writeText(`Subject: ${letter.subject ?? ""}\n\n${letter.body}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function markContacted() {
    const { res, data } = await act("contacted");
    if (res.status === 409 && window.confirm(`${data.error}. Mark as contacted anyway?`)) await act("contacted", { force: true });
  }

  const unsupported = letter?.claims?.filter((cl) => !cl.supported) ?? [];

  return (
    <div className="outreach">
      <div className="row spread">
        <div>
          <strong>{c.companyName}</strong>
          <span className="muted small"> · to {c.owner?.name ?? "the directors"}{email ? ` · ${email}` : " · no email on file"}</span>{" "}
          {letter?.status === "passed" && <span className="pill good">All claims supported</span>}
          {letter?.status === "flagged" && <span className="pill bad">{unsupported.length} unsupported</span>}
          {letter?.status === "unvalidated" && <span className="pill warn">Not validated</span>}
          {c.contactedAt && <span className="pill accent" style={{ marginLeft: 4 }}>Contacted</span>}
        </div>
        <button className="btn accent small" disabled={!!busy || !canGenerate} onClick={generateAndCheck}>{busy ?? (letter ? "Regenerate" : "Generate")}</button>
      </div>
      {error && <div className="err" style={{ marginTop: 10 }}>{error}</div>}
      {letter?.note && <div className="note" style={{ marginTop: 10 }}><strong>For you, not in the message:</strong> {letter.note}</div>}

      {letter && !editing && (
        <div className="grid2" style={{ marginTop: 12 }}>
          <div>
            <div className="small" style={{ marginBottom: 6 }}><strong>Subject:</strong> {letter.subject}</div>
            {letter.claims ? <Highlighted body={letter.body} claims={letter.claims} /> : <div className="letter">{letter.body}</div>}
            <div className="row" style={{ marginTop: 10 }}>
              <button className="btn ghost small" onClick={() => { setText(letter.body); setEditing(true); }}>Edit</button>
              <button className="btn ghost small" disabled={!!busy} onClick={() => run("Checking claims…", "validate")}>Re-validate</button>
              <button className="btn small" onClick={copy}>{copied ? "Copied" : "Copy to clipboard"}</button>
              {c.contactedAt
                ? <button className="btn ghost small" onClick={() => act("uncontacted")}>Undo contacted</button>
                : <button className="btn ghost small" onClick={markContacted}>Mark as contacted</button>}
            </div>
          </div>
          <div>
            <h3>Claim check</h3>
            {letter.claims ? <ClaimList claims={letter.claims} /> : <p className="small muted">Run validation to check this version.</p>}
          </div>
        </div>
      )}
      {letter && editing && (
        <div style={{ marginTop: 12 }}>
          <textarea rows={14} aria-label="Message text" value={text} onChange={(e) => setText(e.target.value)} />
          <div className="row" style={{ marginTop: 8 }}>
            <button className="btn small" disabled={!!busy} onClick={saveEdit}>Save and re-validate</button>
            <button className="btn ghost small" onClick={() => setEditing(false)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
