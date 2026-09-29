// Reads the first worksheet of an .xlsx file in the browser, with no library: an .xlsx file is a
// zip of XML parts, and browsers can inflate zip entries natively (DecompressionStream). Returns
// rows of cell text; numbers are kept as Excel stores them (dates arrive as serial numbers and are
// converted where a date is expected; see excelSerialToDate in the domain package).

interface Entry { name: string; method: number; offset: number; size: number }

function entries(buf: ArrayBuffer): Map<string, Entry> {
  const v = new DataView(buf);
  // The end-of-central-directory record sits in the last 64 KB.
  let eocd = -1;
  for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 65_557); i--) {
    if (v.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('This is not a valid .xlsx file.');
  const count = v.getUint16(eocd + 10, true);
  let p = v.getUint32(eocd + 16, true);
  const out = new Map<string, Entry>();
  const dec = new TextDecoder();
  for (let n = 0; n < count; n++) {
    if (v.getUint32(p, true) !== 0x02014b50) throw new Error('This .xlsx file is damaged.');
    const method = v.getUint16(p + 10, true);
    const size = v.getUint32(p + 20, true);
    const nameLen = v.getUint16(p + 28, true);
    const extraLen = v.getUint16(p + 30, true);
    const commentLen = v.getUint16(p + 32, true);
    const local = v.getUint32(p + 42, true);
    const name = dec.decode(new Uint8Array(buf, p + 46, nameLen));
    // Data starts after the local header, whose name and extra lengths can differ from the central copy.
    const offset = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
    out.set(name, { name, method, offset, size });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

async function read(buf: ArrayBuffer, e: Entry): Promise<string> {
  const raw = new Uint8Array(buf, e.offset, e.size);
  if (e.method === 0) return new TextDecoder().decode(raw);
  if (e.method !== 8) throw new Error('This .xlsx file uses an unsupported compression.');
  const stream = new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Response(stream).text();
}

const xml = (s: string) => new DOMParser().parseFromString(s, 'application/xml');
const byTag = (el: Document | Element, tag: string) => Array.from(el.getElementsByTagNameNS('*', tag));

function columnIndex(ref: string): number {
  const letters = ref.replace(/\d+$/, '');
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

export async function readXlsx(file: File): Promise<string[][]> {
  if (typeof DecompressionStream === 'undefined') throw new Error('This browser cannot read Excel files. Save the sheet as CSV and upload that instead.');
  const buf = await file.arrayBuffer();
  const files = entries(buf);

  // The first sheet in workbook order (not necessarily sheet1.xml).
  let sheetPath = 'xl/worksheets/sheet1.xml';
  const wb = files.get('xl/workbook.xml');
  const rels = files.get('xl/_rels/workbook.xml.rels');
  if (wb && rels) {
    const first = byTag(xml(await read(buf, wb)), 'sheet')[0];
    const rid = first?.getAttribute('r:id') ?? first?.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
    const target = byTag(xml(await read(buf, rels)), 'Relationship').find((r) => r.getAttribute('Id') === rid)?.getAttribute('Target');
    if (target) sheetPath = target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`;
  }
  const sheet = files.get(sheetPath);
  if (!sheet) throw new Error('Could not find a worksheet in this file.');

  const shared: string[] = [];
  const ss = files.get('xl/sharedStrings.xml');
  if (ss) for (const si of byTag(xml(await read(buf, ss)), 'si')) shared.push(byTag(si, 't').map((t) => t.textContent ?? '').join(''));

  const rows: string[][] = [];
  for (const row of byTag(xml(await read(buf, sheet)), 'row')) {
    const cells: string[] = [];
    for (const c of byTag(row, 'c')) {
      const ref = c.getAttribute('r');
      const idx = ref ? columnIndex(ref) : cells.length;
      const type = c.getAttribute('t');
      const v = byTag(c, 'v')[0]?.textContent ?? '';
      let text = v;
      if (type === 's') text = shared[Number(v)] ?? '';
      else if (type === 'inlineStr') text = byTag(c, 't').map((t) => t.textContent ?? '').join('');
      else if (type === 'b') text = v === '1' ? 'TRUE' : 'FALSE';
      while (cells.length < idx) cells.push('');
      cells[idx] = text;
    }
    if (cells.some((x) => x.trim() !== '')) rows.push(cells);
  }
  return rows;
}
