// Layout helpers shared by every part of the master plan.
// Each helper returns docx elements AND appends the same content to a Markdown mirror,
// so one source produces both the Word document and docs/master-plan.md.
const fs = require('fs');
const path = require('path');
const d = require('docx');
const brand = require('./brand');

const {
  Paragraph, TextRun, Table, TableRow, TableCell, WidthType, ShadingType, BorderStyle,
  AlignmentType, HeadingLevel, PageBreak, TableLayoutType, VerticalMergeType, Bookmark, ImageRun,
} = d;

const C = {
  primary: '409EF2', ink: '072435', muted: '4A6275', tint: 'EAF4FE',
  zebra: 'F4F9FE', line: 'D3E4F4', code: 'F3F6F9', white: 'FFFFFF',
};
const FONT = 'Calibri';
const INLINE_MONO = 'Consolas';
const BLOCK_MONO = 'Courier New'; // present in Word, Google Docs and LibreOffice, so trees stay aligned
const W = 9026; // A4 content width in DXA with 1" margins
const FIG_WIDTH_PX = 602; // content width at 96 dpi
const ASSETS = path.join(__dirname, '..', 'assets');

// Brand tokens: {{B}} name, {{BU}} upper case, {{BL}} lower case, {{CO}} company.
const fill = (s) => String(s)
  .replace(/\{\{CO\}\}/g, brand.company)
  .replace(/\{\{BU\}\}/g, brand.name.toUpperCase())
  .replace(/\{\{BL\}\}/g, brand.name.toLowerCase())
  .replace(/\{\{B\}\}/g, brand.name);

const md = [];
const toc = [];
let figureCount = 0;
const mdBlock = (...lines) => { md.push(...lines.map(fill), ''); };
const mdCell = (t) => fill(t).replace(/\|/g, '\\|').replace(/\n/g, '<br>');

// Parses **bold** and `code` inline markup into runs.
function runs(text, base = {}) {
  const src = fill(text);
  const out = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let last = 0;
  let m;
  while ((m = re.exec(src))) {
    if (m.index > last) out.push(new TextRun({ text: src.slice(last, m.index), ...base }));
    const t = m[0];
    if (t.startsWith('**')) out.push(new TextRun({ text: t.slice(2, -2), bold: true, ...base }));
    else out.push(new TextRun({ text: t.slice(1, -1), font: INLINE_MONO, size: (base.size || 21) - 2, color: base.color || C.ink }));
    last = m.index + t.length;
  }
  if (last < src.length) out.push(new TextRun({ text: src.slice(last), ...base }));
  return out;
}

function P(text, opts = {}) {
  if (!opts.noMd) mdBlock(text);
  return new Paragraph({
    children: runs(text, opts.run || {}),
    spacing: { after: 140, line: 288 },
    alignment: opts.align,
    keepNext: opts.keepNext,
  });
}

// H1 carries a bookmark so the pre-filled Contents entries can link to it.
function H1(text, { part = false } = {}) {
  const t = fill(text);
  const id = `sec_${toc.length + 1}`;
  toc.push({ id, text: t, part });
  mdBlock(`${part ? '#' : '##'} ${t}`);
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    keepNext: true,
    spacing: part ? { before: 2200, after: 240 } : undefined,
    children: [new Bookmark({ id, children: [new TextRun(part ? { text: t, size: 52 } : { text: t })] })],
  });
}
function H2(text) {
  mdBlock(`### ${text}`);
  return new Paragraph({ heading: HeadingLevel.HEADING_2, keepNext: true, children: [new TextRun(fill(text))] });
}
function H3(text) {
  mdBlock(`#### ${text}`);
  return new Paragraph({ heading: HeadingLevel.HEADING_3, keepNext: true, children: [new TextRun(fill(text))] });
}

function bullets(items) {
  mdBlock(...items.map((t) => `- ${t}`));
  return items.map((t) => new Paragraph({
    numbering: { reference: 'bullets', level: 0 },
    children: runs(t),
    spacing: { after: 70, line: 276 },
  }));
}

let listInstance = 0;
function numbered(items) {
  mdBlock(...items.map((t) => `1. ${t}`));
  listInstance += 1;
  const instance = listInstance;
  return items.map((t) => new Paragraph({
    numbering: { reference: 'numbers', level: 0, instance },
    children: runs(t),
    spacing: { after: 70, line: 276 },
  }));
}

const border = (color = C.line, size = 4) => ({ style: BorderStyle.SINGLE, size, color });
const noBorder = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };

function cell(text, width, { header = false, fill: bg, bold = false, size = 19, pad = 110, vMerge } = {}) {
  const lines = String(text).split('\n');
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    shading: bg ? { type: ShadingType.CLEAR, color: 'auto', fill: bg } : undefined,
    margins: { top: 70, bottom: 70, left: pad, right: pad },
    verticalMerge: vMerge,
    children: lines.map((l) => new Paragraph({
      spacing: { after: 30, line: 264 },
      children: runs(l, { size, bold: header || bold, color: header ? C.white : C.ink }),
    })),
  });
}

// weights are relative; they are scaled to the full content width.
// group: an empty first cell continues the group above (vertically merged).
// size (half-points) and pad (DXA) shrink text and cell padding for dense matrices.
function table(headers, rows, weights, { firstColBold = true, group = false, size = 19, pad = 110 } = {}) {
  md.push(`| ${headers.map(mdCell).join(' | ')} |`, `| ${headers.map(() => '---').join(' | ')} |`);
  for (const r of rows) md.push(`| ${r.map(mdCell).join(' | ')} |`);
  md.push('');

  const total = weights.reduce((a, b) => a + b, 0);
  const widths = weights.map((w) => Math.floor((w / total) * W));
  widths[widths.length - 1] += W - widths.reduce((a, b) => a + b, 0);
  const hdr = new TableRow({
    tableHeader: true,
    cantSplit: true,
    children: headers.map((h, i) => cell(h, widths[i], { header: true, fill: C.ink, size, pad })),
  });
  const body = rows.map((r, ri) => new TableRow({
    cantSplit: true,
    children: r.map((v, i) => {
      if (group && i === 0) {
        const continues = ri > 0 && v === '';
        const starts = !continues && ri + 1 < rows.length && rows[ri + 1][0] === '';
        return cell(v, widths[0], {
          fill: C.white,
          bold: true,
          size,
          pad,
          vMerge: continues ? VerticalMergeType.CONTINUE : (starts ? VerticalMergeType.RESTART : undefined),
        });
      }
      return cell(v, widths[i], { fill: ri % 2 ? C.zebra : C.white, bold: firstColBold && i === 0, size, pad });
    }),
  }));
  return [new Table({
    width: { size: W, type: WidthType.DXA },
    columnWidths: widths,
    layout: TableLayoutType.FIXED,
    borders: {
      top: border(), bottom: border(), left: border(), right: border(),
      insideHorizontal: border(), insideVertical: border(),
    },
    rows: [hdr, ...body],
  }), spacer()];
}

// Tinted box with a primary-colour left rule for decisions and notes.
function callout(title, paras) {
  const mdLines = [];
  if (title) mdLines.push(`> **${title}**`, '>');
  const children = [];
  if (title) children.push(new Paragraph({ spacing: { after: 80 }, children: [new TextRun({ text: fill(title), bold: true, color: C.primary, size: 21 })] }));
  for (const t of [].concat(paras)) {
    if (Array.isArray(t)) {
      for (const b of t) {
        mdLines.push(`> - ${b}`);
        children.push(new Paragraph({ numbering: { reference: 'bullets', level: 0 }, spacing: { after: 50, line: 264 }, children: runs(b, { size: 20 }) }));
      }
    } else {
      mdLines.push(`> ${t}`, '>');
      children.push(new Paragraph({ spacing: { after: 70, line: 276 }, children: runs(t, { size: 20 }) }));
    }
  }
  if (mdLines[mdLines.length - 1] === '>') mdLines.pop();
  mdBlock(...mdLines);
  return [new Table({
    width: { size: W, type: WidthType.DXA },
    columnWidths: [W],
    borders: { top: noBorder, bottom: noBorder, right: noBorder, left: border(C.primary, 24), insideHorizontal: noBorder, insideVertical: noBorder },
    rows: [new TableRow({ children: [new TableCell({
      width: { size: W, type: WidthType.DXA },
      shading: { type: ShadingType.CLEAR, color: 'auto', fill: C.tint },
      margins: { top: 140, bottom: 100, left: 220, right: 200 },
      children,
    })] })],
  }), spacer()];
}

function code(text, lang = 'text') {
  const lines = fill(text).replace(/^\n/, '').replace(/\s+$/, '').split('\n');
  md.push('```' + lang, ...lines, '```', '');
  return [new Table({
    width: { size: W, type: WidthType.DXA },
    columnWidths: [W],
    borders: { top: border(), bottom: border(), left: border(), right: border(), insideHorizontal: noBorder, insideVertical: noBorder },
    rows: [new TableRow({ children: [new TableCell({
      width: { size: W, type: WidthType.DXA },
      shading: { type: ShadingType.CLEAR, color: 'auto', fill: C.code },
      margins: { top: 120, bottom: 120, left: 180, right: 180 },
      children: lines.map((l) => new Paragraph({ spacing: { after: 0, line: 240 }, children: [new TextRun({ text: l || ' ', font: BLOCK_MONO, size: 16, color: C.ink })] })),
    })] })],
  }), spacer()];
}

// Embeds a rendered figure from ../assets (see diagrams.js) with a numbered caption.
function figure(name, caption) {
  figureCount += 1;
  const buf = fs.readFileSync(path.join(ASSETS, `${name}.png`));
  const w = buf.readUInt32BE(16);
  const h = buf.readUInt32BE(20);
  const cap = `Figure ${figureCount}. ${fill(caption)}`;
  mdBlock(`![${cap}](assets/${name}.png)`);
  mdBlock(`*${cap}*`);
  return [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 120, after: 60 },
      keepNext: true,
      children: [new ImageRun({
        type: 'png',
        data: buf,
        transformation: { width: FIG_WIDTH_PX, height: Math.round((FIG_WIDTH_PX * h) / w) },
        altText: { name, title: cap, description: cap },
      })],
    }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 240 }, children: [new TextRun({ text: cap, italics: true, size: 18, color: C.muted })] }),
  ];
}

const spacer = () => new Paragraph({ spacing: { after: 80 }, children: [] });
const pageBreak = () => new Paragraph({ children: [new PageBreak()] });

function partDivider(title, intro) {
  return [
    pageBreak(),
    H1(title, { part: true }),
    new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: C.primary, space: 1 } }, spacing: { after: 240 }, children: [] }),
    P(intro, { run: { size: 23, color: C.muted } }),
    pageBreak(),
  ];
}

module.exports = {
  d, C, FONT, W, brand, fill, md, toc, mdBlock, runs, P, H1, H2, H3,
  bullets, numbered, table, callout, code, figure, spacer, pageBreak, partDivider,
};
