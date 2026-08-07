/**
 * RESUME BUILD TEMPLATE — Resume Factory v2 reference implementation
 *
 * Usage:
 *   npm install docx
 *   node resume_build_template.js
 *   soffice --headless --convert-to pdf <output>.docx     (or the sandbox soffice wrapper)
 *   pdfinfo <output>.pdf | grep Pages                     (verify against PAGE_LIMIT — never guess)
 *   pdftotext <output>.pdf - | head -50                   (ATS linear-parse check)
 *
 * To generate a new variant: edit ONLY the CONTENT object. Layout code below it is settled —
 * it encodes the one-page compression dials found by trial on 2026-07-05:
 *   body line rule 224 AUTO (0.93x single) · bullet after-spacing 10 · section headers 70/26 ·
 *   role headers 50/6 · margins at spec floor (0.6" top/bottom, 0.63" sides).
 * If a variant overflows its page limit: trim CONTENT text first (summary redundancy, longest
 * bullets), then spacing — never fonts below 10.5pt, never margins below 0.6".
 */

const fs = require("fs");
const {
  Document, Packer, Paragraph, TextRun, AlignmentType, TabStopType,
  LevelFormat, BorderStyle, LineRuleType,
} = require("docx");

// ============================== CONTENT (edit per variant) ==============================
// Variant: Datadog Technical Account Manager 3 - East — Boston/NY (Positioning C:
// Enterprise Relationship Seller with Technical Depth). Built 2026-07-10 for
// careers.datadoghq.com/detail/8046392 (R19786). ≤2 pages (auto); 1-page build.
// Story: trusted-advisor technical seller — AE+SE hybrid depth, cloud adoption guidance,
// multi-cloud fluency (sold *against* AWS/Azure/GCP), installed-base expansion — bridged
// to TAM product-adoption / customer-success motion. Never claims Datadog product use,
// prior TAM title, Docker/K8s/CI-CD ops tooling, or monitoring-platform experience.
// Degree title verified 2026-07-06 (§9→§3); graduation year still quarantined.

// Resume content lives in a gitignored user-layer file so this public template
// carries no personal data. Copy resume-content.example.js to
// resume-content.local.js and fill in your own details.
const CONTENT_PATH = process.env.RESUME_CONTENT || "./resume-content.local.js";
let CONTENT;
try {
  CONTENT = require(CONTENT_PATH);
} catch {
  console.error(
    "Missing resume content: " + CONTENT_PATH + "\n" +
    "Copy resume-content.example.js -> resume-content.local.js and edit it " +
    "(it is gitignored), or set RESUME_CONTENT to your own file."
  );
  process.exit(1);
}

// ============================== LAYOUT (settled — do not tune first) ==============================

const PAGE_W = 12240, PAGE_H = 15840; // US Letter, DXA
const M_L = 907, M_R = 907, M_T = 864, M_B = 864; // 0.63" sides, 0.6" top/bottom (spec floor)
const RIGHT_TAB = PAGE_W - M_L - M_R;
const GRAY = "3D3D3D", LIGHT = "666666", ACCENT = "C7501F";
const BODY = { line: 220, lineRule: LineRuleType.AUTO }; // 224 → 220 (0.92x): last dial before content cuts; fonts and margins untouched

const t = (text, opts = {}) => new TextRun({ text, ...opts });

const sectionHeader = (label) => new Paragraph({
  spacing: { before: 54, after: 24 }, // 70/26 → 54/24: variant-level compression, still above visual floor
  border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "999999", space: 2 } },
  children: [t(label, { bold: true, allCaps: true, size: 20, characterSpacing: 16 })],
});

const roleHeader = (title, dates) => new Paragraph({
  spacing: { before: 42, after: 6 }, // 50 → 42
  tabStops: [{ type: TabStopType.RIGHT, position: RIGHT_TAB }],
  children: [t(title, { bold: true, size: 21 }), t("\t" + dates, { size: 20, color: LIGHT })],
});

const companyLine = (txt) => new Paragraph({
  spacing: { after: 12, ...BODY },
  children: [t(txt, { size: 20, color: LIGHT })],
});

const bullet = (txt) => new Paragraph({
  numbering: { reference: "dash", level: 0 },
  spacing: { after: 8, ...BODY }, // 10 → 8: reclaim the education line on this variant (spec allows spacing after text trims)
  children: [t(txt)],
});

const bodyPara = (txt, opts = {}) => new Paragraph({
  spacing: { after: 18, ...BODY },
  children: [t(txt, opts)],
});

const children = [
  new Paragraph({ spacing: { after: 10 }, children: [t(CONTENT.name, { bold: true, size: 36, color: "1A1A1A" })] }),
  new Paragraph({ spacing: { after: 20 }, children: [t(CONTENT.headline, { size: 22, color: GRAY })] }),
  new Paragraph({
    spacing: { after: 30 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: ACCENT, space: 4 } },
    children: [t(CONTENT.contact, { size: 20 })],
  }),
  sectionHeader("Summary"),
  new Paragraph({ spacing: { after: 24, ...BODY }, children: [t(CONTENT.summary)] }),
  bodyPara(CONTENT.stats, { bold: true, size: 20 }),
  sectionHeader("Experience"),
];

for (const r of CONTENT.roles) {
  children.push(roleHeader(r.title, r.dates));
  children.push(companyLine(r.org));
  for (const b of r.bullets) children.push(bullet(b));
}

children.push(sectionHeader(CONTENT.projectsSection.header));
for (const b of CONTENT.projectsSection.bullets) children.push(bullet(b));

children.push(sectionHeader("Certifications"));
children.push(bodyPara(CONTENT.certifications));
children.push(sectionHeader("Core Competencies"));
children.push(bodyPara(CONTENT.competencies));
children.push(sectionHeader("Education"));
children.push(new Paragraph({ spacing: { ...BODY }, children: [t(CONTENT.education)] }));

const doc = new Document({
  creator: CONTENT.name,
  title: CONTENT.docTitle,
  styles: { default: { document: { run: { font: "Calibri", size: 21, color: GRAY } } } },
  numbering: {
    config: [{
      reference: "dash",
      levels: [{
        level: 0, format: LevelFormat.BULLET, text: "–",
        alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 274, hanging: 158 } } },
      }],
    }],
  },
  sections: [{
    properties: { page: { size: { width: PAGE_W, height: PAGE_H }, margin: { top: M_T, bottom: M_B, left: M_L, right: M_R } } },
    children,
  }],
});

Packer.toBuffer(doc).then(buf => {
  fs.writeFileSync(CONTENT.file, buf);
  console.log("written:", CONTENT.file);
});
