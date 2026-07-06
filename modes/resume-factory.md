# Mode: resume-factory — Integrity-Railed Resume Generation (Resume Factory v2)

**Routing rule: this mode replaces the default `pdf` mode for all resume/CV generation.**
The `pdf` mode's HTML pipeline remains in use for cover letters (`cover`) only.
Trigger this mode whenever the user asks for a resume, CV, or tailored application
document, or when the auto-pipeline reaches its CV-generation step.

## Why this mode exists

Generic per-JD CV adaptation optimizes keywords; this pipeline optimizes keywords
**under integrity constraints**: a canonical fact sheet as the single source of truth,
a quarantine list of claims that may never print, and a QA gate verified by commands
rather than judgment. Every output must survive a hostile interview drill-down and a
background check.

## Full pipeline

1. Read `modes/resume-factory-spec.md` (Resume Factory v2) in full. It is self-contained
   and overrides anything in this file if they conflict.
2. Take the JD from context (auto-pipeline evaluation, pasted text, or URL — fetch if URL).
   Do NOT re-ask the spec's resolved questions; the fact sheet in the spec §3 is final.
3. Execute the spec: parse JD → auto-select positioning (§4) → apply company format
   rules (§5) → draft to format spec (§6).
4. Facts come ONLY from spec §3 (mirrored in `cv.md`). The quarantine list (spec §9)
   is binding: degree title/year, any CRM tool, unverified certifications, and the
   $1.3M ARR figure never print.
5. Build the .docx by editing ONLY the `CONTENT` object in `resume_build_template.js`
   (project root), then run:
   `node resume_build_template.js`
6. Convert to PDF and verify — never guess page count:
   - macOS with LibreOffice: `soffice --headless --convert-to pdf <file>.docx --outdir output/`
   - No LibreOffice: report the .docx path and instruct the user to export PDF from
     Word/Pages; do not skip the page-count check — ask the user to confirm it.
7. Run the QA gate (spec §7) and PRINT the checklist with explicit pass/fail per item
   before delivering:
   [ ] page count ≤ limit (verified from rendered PDF)
   [ ] banned-strings scan clean (responsible for / results-driven / dynamic / synergy /
       "Present" / passionate outside WHOOP context / >1 leverage)
   [ ] every number, title, date, cert traceable to spec §3
   [ ] no target-product experience claims (glossary applied)
   [ ] pdftotext linear-order check clean
   [ ] "Oracle Cloud Infrastructure (OCI)" spelled out on first use; en-dash dates
   A resume may not be delivered with any item unchecked.
8. Save outputs to `output/Jared_Werba_Resume_{Company}_{Role}.docx` and `.pdf`.
9. Log to the tracker with the standard fields; note in the entry that the PDF came
   from the resume-factory pipeline (the dashboard's HTML-regenerate hotkey does not
   apply to these files).
10. Report to the user: file paths, positioning selected (A/B/C) and why, keyword
    coverage vs. this JD (covered / consciously dropped / uncovered), and risk flags.

## Dependencies

- `npm install docx` (one-time, in the career-ops directory)
- LibreOffice for automated PDF conversion (`brew install --cask libreoffice` on macOS),
  or manual export as fallback per step 6.
