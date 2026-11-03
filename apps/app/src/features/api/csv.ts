// CSV in and out for the structure import (API D13). Pure: text in, rows out. RFC 4180 quotes (doubled quote,
// line breaks inside quotes), an optional BOM, and a separator of `,` or `;` read from the header line.

export type Sep = "," | ";";

export type ParsedCsv = {
  header: string[];
  rows: string[][];
  /** The separator the header line used. */
  sep: Sep;
  /** The line (1-based, in the file) each row starts on; a quoted line break makes this differ from the row number. */
  lines: number[];
  /** True when a quote was opened and never closed. */
  unterminated: boolean;
};

/** `;` when the header line (outside quotes) has more of them than commas, else `,`. */
function detectSep(text: string): Sep {
  let commas = 0;
  let semis = 0;
  let quoted = false;
  for (const ch of text) {
    if (ch === '"') quoted = !quoted;
    else if (!quoted && (ch === "\n" || ch === "\r")) break;
    else if (!quoted && ch === ",") commas++;
    else if (!quoted && ch === ";") semis++;
  }
  return semis > commas ? ";" : ",";
}

export function parseCsv(input: string): ParsedCsv {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const sep = detectSep(text);
  const records: { cells: string[]; line: number }[] = [];
  let cells: string[] = [];
  let cell = "";
  let quoted = false;
  let started = false; // anything seen in this record, so a blank line is skipped
  let line = 1;
  let startLine = 1;
  let unterminated = false;

  const endCell = () => { cells.push(cell); cell = ""; };
  const endRecord = () => {
    endCell();
    if (started) records.push({ cells, line: startLine });
    cells = [];
    started = false;
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; }
        else quoted = false;
      } else {
        if (ch === "\n") line++;
        cell += ch;
      }
      continue;
    }
    if (ch === '"') {
      if (!started) startLine = line;
      quoted = true;
      started = true;
    } else if (ch === sep) {
      if (!started) startLine = line;
      started = true;
      endCell();
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      endRecord();
      line++;
    } else {
      if (!started) startLine = line;
      started = true;
      cell += ch;
    }
  }
  if (quoted) unterminated = true;
  if (started || cell !== "") endRecord();

  const [head, ...body] = records;
  return {
    header: head ? head.cells.map((h) => h.trim()) : [],
    rows: body.map((r) => r.cells),
    sep,
    lines: body.map((r) => r.line),
    unterminated,
  };
}

const needsQuotes = (s: string, sep: Sep) => s.includes(sep) || s.includes('"') || s.includes("\n") || s.includes("\r") || s !== s.trim();

/** A header and rows as CSV text, lines ended with CRLF. A cell is quoted only when it has to be. */
export function writeCsv(header: readonly string[], rows: readonly (readonly string[])[], sep: Sep = ","): string {
  const cell = (s: string) => (needsQuotes(s, sep) ? `"${s.replaceAll('"', '""')}"` : s);
  return [header, ...rows].map((r) => r.map(cell).join(sep)).join("\r\n") + "\r\n";
}
