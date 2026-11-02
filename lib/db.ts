import { Pool } from "pg";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS companies (
  id SERIAL PRIMARY KEY,
  csv_name TEXT NOT NULL,
  csv_number TEXT,
  csv_website TEXT,
  csv_owner TEXT,
  csv_email TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  status_note TEXT,
  match_method TEXT,
  match_confidence TEXT,
  match_reason TEXT,
  candidates JSONB,
  suggested_number TEXT,
  company_number TEXT,
  company_name TEXT,
  website TEXT,
  website_status TEXT,
  website_note TEXT,
  selected BOOLEAN NOT NULL DEFAULT FALSE,
  contacted_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS facts (
  id SERIAL PRIMARY KEY,
  company_id INT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  label TEXT NOT NULL,
  value TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_url TEXT,
  letter_safe BOOLEAN NOT NULL DEFAULT TRUE,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, key)
);
CREATE TABLE IF NOT EXISTS people (
  id SERIAL PRIMARY KEY,
  company_id INT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  name TEXT NOT NULL,
  title TEXT,
  forename TEXT,
  surname TEXT,
  ownership_band TEXT,
  ownership_min INT,
  dob_year INT,
  dob_month INT,
  source_url TEXT
);
CREATE TABLE IF NOT EXISTS website_checks (
  id SERIAL PRIMARY KEY,
  company_id INT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  criterion TEXT NOT NULL,
  answer TEXT NOT NULL,
  snippet TEXT,
  source_url TEXT,
  note TEXT,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, criterion)
);
CREATE TABLE IF NOT EXISTS letters (
  company_id INT PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  claims JSONB,
  validation_status TEXT NOT NULL DEFAULT 'unvalidated',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE letters ADD COLUMN IF NOT EXISTS note TEXT;
ALTER TABLE letters ADD COLUMN IF NOT EXISTS subject TEXT;
ALTER TABLE letters ADD COLUMN IF NOT EXISTS literals JSONB;
CREATE TABLE IF NOT EXISTS templates (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  subject TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS settings (
  id INT PRIMARY KEY DEFAULT 1,
  thesis JSONB NOT NULL DEFAULT '{}',
  operator JSONB NOT NULL DEFAULT '{}',
  criteria JSONB NOT NULL DEFAULT '[]'
);
INSERT INTO settings (id) VALUES (1) ON CONFLICT DO NOTHING;
`;

type Globals = { pool?: Pool; ready?: Promise<unknown> };
const g = globalThis as unknown as Globals;

function pool(): Pool {
  if (!g.pool) {
    if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");
    g.pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5 });
  }
  return g.pool;
}

export async function q<T extends object = Record<string, any>>(sql: string, params: unknown[] = []): Promise<T[]> {
  // A failed attempt is forgotten, so a database that was briefly down doesn't break the app until restart.
  g.ready ??= pool().query(SCHEMA).catch((err) => {
    g.ready = undefined;
    throw err;
  });
  await g.ready;
  const res = await pool().query(sql, params as any[]);
  return res.rows as T[];
}
