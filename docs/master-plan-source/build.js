// Builds ../<Brand>_Master_Plan_v3.docx and ../master-plan.md from the part files.
// Run `node diagrams.js` first (or `npm run build`) so ../assets holds the figures.
const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');
const { d, C, FONT, W, brand, fill, md, toc } = require('./h');
const meta = require('./meta');

const {
  Document, Packer, Paragraph, TextRun, AlignmentType, LevelFormat, Header, Footer,
  PageNumber, BorderStyle, TabStopType, LeaderType,
} = d;

const front = require('./front');
const partA = require('./partA');
const partB = require('./partB');
const partC = require('./partC');
const partD = require('./partD');

const OUT_DIR = path.join(__dirname, '..');
const DOCX = `${brand.name}_Master_Plan_v${meta.version}.docx`;
const TITLE = fill('{{B}} Master Plan and MVP Technical Implementation Guide');

// Built strictly in reading order: the Markdown mirror is appended as elements are created.
const children = [...front(), ...partA(), ...partB(), ...partC(), ...partD()];

const header = new Header({ children: [new Paragraph({
  border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: C.line, space: 4 } },
  tabStops: [{ type: TabStopType.RIGHT, position: W }],
  children: [
    new TextRun({ text: fill('{{BU}}'), bold: true, color: C.primary, size: 16, characterSpacing: 60 }),
    new TextRun({ text: `\tMaster Plan and MVP Technical Implementation Guide  |  v${meta.version}`, color: C.muted, size: 16 }),
  ],
})] });

const footer = new Footer({ children: [new Paragraph({
  tabStops: [{ type: TabStopType.RIGHT, position: W }],
  children: [
    new TextRun({ text: fill('Confidential  |  {{CO}} (proposed)'), color: C.muted, size: 16 }),
    new TextRun({ children: ['\tPage ', PageNumber.CURRENT], color: C.muted, size: 16 }),
  ],
})] });

const doc = new Document({
  creator: brand.name,
  title: TITLE,
  description: `Version ${meta.version}, ${meta.date}`,
  features: { updateFields: true },
  styles: {
    default: { document: { run: { font: FONT, size: 21, color: C.ink } } },
    paragraphStyles: [
      { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 32, bold: true, color: C.ink, font: FONT },
        paragraph: { spacing: { before: 360, after: 160 }, outlineLevel: 0, keepNext: true } },
      { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 25, bold: true, color: C.primary, font: FONT },
        paragraph: { spacing: { before: 260, after: 110 }, outlineLevel: 1, keepNext: true } },
      { id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 22, bold: true, color: C.ink, font: FONT },
        paragraph: { spacing: { before: 200, after: 90 }, outlineLevel: 2, keepNext: true } },
      { id: 'TOC1', name: 'toc 1', basedOn: 'Normal', next: 'Normal',
        run: { size: 20, color: C.ink, font: FONT },
        paragraph: { spacing: { after: 50 }, tabStops: [{ type: TabStopType.RIGHT, position: W, leader: LeaderType.DOT }] } },
    ],
  },
  numbering: { config: [
    { reference: 'bullets', levels: [
      { level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 540, hanging: 270 } }, run: { color: C.primary } } },
    ] },
    { reference: 'numbers', levels: [
      { level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 540, hanging: 360 } }, run: { bold: true, color: C.primary } } },
    ] },
  ] },
  sections: [{
    properties: { page: { margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 } }, titlePage: true },
    headers: { default: header, first: new Header({ children: [] }) },
    footers: { default: footer, first: new Footer({ children: [] }) },
    children,
  }],
});

const xmlEscape = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Pre-fills the Contents field result with linked entries (no page numbers until Word refreshes it).
function tocEntriesXml() {
  return toc.map((e) => {
    const ppr = `<w:pPr><w:pStyle w:val="TOC1"/>${e.part ? '<w:spacing w:before="160"/>' : ''}</w:pPr>`;
    const rpr = e.part ? `<w:rPr><w:b/><w:color w:val="${C.violet}"/></w:rPr>` : '';
    return `<w:p>${ppr}<w:hyperlink w:anchor="${e.id}" w:history="1"><w:r>${rpr}<w:t xml:space="preserve">${xmlEscape(e.text)}</w:t></w:r></w:hyperlink></w:p>`;
  }).join('');
}

// GitHub heading anchors: lower case, punctuation removed, spaces to hyphens.
const slug = (t) => t.trim().toLowerCase().replace(/[^\p{L}\p{N}\p{M}\s_-]/gu, '').replace(/\s/g, '-');

function markdownToc() {
  let inPart = false;
  return toc.map((e) => {
    const link = `[${e.text}](#${slug(e.text)})`;
    if (e.part) { inPart = true; return `- **${link}**`; }
    return `${inPart ? '  ' : ''}- ${link}`;
  }).join('\n');
}

(async () => {
  const zip = await JSZip.loadAsync(await Packer.toBuffer(doc));
  let xml = await zip.file('word/document.xml').async('string');
  const marker = '<w:fldChar w:fldCharType="separate"/></w:r></w:p>';
  const at = xml.indexOf(marker);
  if (at < 0) throw new Error('Contents field not found in document.xml');
  xml = xml.slice(0, at + marker.length) + tocEntriesXml() + xml.slice(at + marker.length);
  zip.file('word/document.xml', xml);
  const out = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  fs.writeFileSync(path.join(OUT_DIR, DOCX), out);

  const markdown = md.join('\n').replace('<!--TOC-->', markdownToc()).replace(/\n{3,}/g, '\n\n');
  fs.writeFileSync(path.join(OUT_DIR, 'master-plan.md'), markdown);
  console.log(`wrote ${DOCX} (${out.length} bytes), master-plan.md (${markdown.length} chars), ${toc.length} contents entries`);
})();
