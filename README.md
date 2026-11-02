# Searchlight

A tool for UK search fund operators to find SME owners who might sell, and write to them using only facts it can trace to a source.

## The flow

1. **Import** an Excel or CSV list. Only a company name is required. Rows are processed in batches within the Companies House rate limit, with per-row progress that survives a refresh.
2. **Enrich** from Companies House. An exact normalised name on an active company is accepted automatically. Anything else goes to Haiku to choose from the search results, and the user confirms when confidence isn't high. Every fact is stored with its source, and owner age is shown as a band.
3. **Shortlist** against a thesis: sectors searched in plain English, company age, an owner age window, and active, independence and size filters. The score is deterministic and lists each factor.
4. **Check websites** on shortlisted companies only (5 second budget). Sonnet answers each criterion yes, no or unclear and pulls details for outreach.
5. **Build messages** from templates: plain text goes out word for word, `[details]` fill in stored facts, and `{curly brackets}` are rewritten by AI using researched facts only. Test on a company and iterate before generating for real.
6. **Validate** each message: every factual claim must cite a stored fact, and unsupported claims are highlighted. Copy it and mark as contacted. Nothing is actually sent.

## What code enforces, rather than prompts

- A website quote must appear on the fetched page, or the answer becomes "unclear".
- Figures in a message are checked against the facts the claim cites.
- Haiku's match must be one of the search results.
- AI sections can't change the fixed text around them, because code assembles the message.
- Age, shareholding, accounts and insolvency are used for targeting and are never passed to the message writer.
- Dates of birth never reach the browser.
- Website fetches refuse internal addresses, and page text is treated as untrusted.

## Known limits

- Companies House has no "acquired" flag, so that filter infers it from a corporate parent, subsidiary accounts or a recent change of control.
- With no individual PSC, the owner falls back to the oldest active director, and the screen says so.
- An exact name can still be the wrong firm: "JCB" matches a dormant JCB Limited.
- Sites that block automated requests or need JavaScript come back "unclear".
- Nothing checks automatically that a website belongs to the company. The drafting model has spotted wrong sites in testing and warned the sender.
- Single-user demo: no accounts, just an optional site password.

## Stack

Next.js, TypeScript and Postgres on Railway. Claude Haiku 5.5 for name matching and sector suggestions, Sonnet 5.5 for website reading, Opus 5.5 for message writing and validation.

## Running it

Copy `env/.env.example` to `env/.env.local` and fill it in. You'll need a [Companies House API key](https://developer.company-information.service.gov.uk/), an Anthropic key and a Postgres `DATABASE_URL`.

```bash
npm install
npm run dev
```

`samples/20-companies.csv` is a test list.
