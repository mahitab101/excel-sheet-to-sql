import * as XLSX from 'xlsx';

export type Dialect = 'mysql' | 'postgres' | 'mssql' | 'none';
export type InsertMode = 'batch' | 'single';

export type CellValue = string | number | boolean | Date | null | undefined;
export type SheetRow = Record<string, CellValue>;

export interface GenOptions {
  tableName: string;
  dialect: Dialect;
  insertMode: InsertMode;
  batchSize: number;
  autoId: boolean;
  blankNull: boolean;
  flatten: boolean;
  createTable: boolean;
}

export interface GenResult {
  sql: string;
  statementCount: number;
  keys: string[];
  data: SheetRow[];
}

/* ---------- Identifiers ---------- */

export function sanitizeIdentifier(name: string | null | undefined): string {
  return (
    String(name ?? 'col')
      .trim()
      .replace(/[^a-zA-Z0-9_]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .replace(/^(\d)/, 'c_$1') || 'col'
  );
}

export function quoteIdent(name: string, dialect: Dialect): string {
  const clean = String(name);
  if (dialect === 'mysql') return '`' + clean.replace(/`/g, '``') + '`';
  if (dialect === 'postgres') return '"' + clean.replace(/"/g, '""') + '"';
  if (dialect === 'mssql') return '[' + clean.replace(/]/g, ']]') + ']';
  return clean;
}

/* ---------- Sheet parsing ---------- */

/** Scans the first ~25 rows and returns the 0-based index of the row that
 * looks most like a header (most non-empty cells) — skips logo/title blocks. */
export function detectHeaderRow(ws: XLSX.WorkSheet): number {
  const rows2d = XLSX.utils.sheet_to_json<CellValue[]>(ws, { header: 1, raw: true, defval: null });
  const scanLimit = Math.min(rows2d.length, 25);
  let bestIdx = 0;
  let bestCount = -1;
  for (let i = 0; i < scanLimit; i++) {
    const r = rows2d[i] || [];
    const count = r.filter((c) => c !== null && c !== undefined && String(c).trim() !== '').length;
    if (count > bestCount) {
      bestCount = count;
      bestIdx = i;
    }
  }
  return bestIdx;
}

export interface ParsedSheet {
  headerKeys: string[];
  rows: SheetRow[];
}

export function parseSheet(ws: XLSX.WorkSheet, headerRowIdx: number): ParsedSheet {
  const data = XLSX.utils.sheet_to_json<SheetRow>(ws, { raw: true, defval: null, range: headerRowIdx });

  if (data.length === 0) return { headerKeys: [], rows: [] };

  const headerRow =
    XLSX.utils.sheet_to_json<CellValue[]>(ws, { header: 1, raw: true, range: headerRowIdx })[0] ||
    Object.keys(data[0]);

  let headerKeys = headerRow
    .map((h) => (h === null || h === undefined || h === '' ? null : String(h)))
    .filter((h): h is string => Boolean(h));

  if (headerKeys.length === 0) headerKeys = Object.keys(data[0]);

  return { headerKeys, rows: data };
}

/* ---------- JSON-array cell flattening ---------- */

function tryParseJsonArrayOfObjects(val: CellValue): Array<Record<string, unknown>> | null {
  if (typeof val !== 'string') return null;
  const t = val.trim();
  if (!t.startsWith('[{')) return null;
  try {
    const parsed = JSON.parse(t);
    if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === 'object' && parsed[0] !== null) {
      return parsed as Array<Record<string, unknown>>;
    }
  } catch {
    /* not valid JSON, ignore */
  }
  return null;
}

export function buildWorkingData(
  headerKeys: string[],
  rows: SheetRow[],
  opts: Pick<GenOptions, 'flatten' | 'autoId'>,
): { keys: string[]; data: SheetRow[] } {
  let keys = headerKeys.slice();
  const data: SheetRow[] = rows.map((r) => ({ ...r }));

  if (opts.flatten && data.length) {
    const flattenCols: Record<string, string[]> = {};
    keys.forEach((k) => {
      for (const row of data) {
        const parsed = tryParseJsonArrayOfObjects(row[k]);
        if (parsed) {
          flattenCols[k] = Object.keys(parsed[0]);
          break;
        }
      }
    });
    Object.keys(flattenCols).forEach((k) => {
      const subKeys = flattenCols[k];
      const newCols = subKeys.map((sk) => sanitizeIdentifier(k + '_' + sk));
      data.forEach((row) => {
        const parsed = tryParseJsonArrayOfObjects(row[k]);
        subKeys.forEach((sk, i) => {
          row[newCols[i]] = (parsed ? (parsed[0][sk] as CellValue) : null) ?? null;
        });
        delete row[k];
      });
      const pos = keys.indexOf(k);
      keys.splice(pos, 1, ...newCols);
    });
  }

  if (opts.autoId) {
    const hasIdCol = keys.some((k) => k.toLowerCase() === 'id');
    if (!hasIdCol) {
      keys = ['ID', ...keys];
      data.forEach((row, idx) => {
        row.ID = idx + 1;
      });
    } else {
      const idKey = keys.find((k) => k.toLowerCase() === 'id')!;
      data.forEach((row, idx) => {
        if (row[idKey] === null || row[idKey] === undefined || row[idKey] === '') row[idKey] = idx + 1;
      });
    }
  }

  return { keys, data };
}

/* ---------- Type inference for CREATE TABLE ---------- */

function inferColumnType(values: CellValue[]): string {
  let sawNumber = false;
  let sawFloat = false;
  let sawDate = false;
  let sawBool = false;
  let sawString = false;
  let maxLen = 0;
  let anyValue = false;

  for (const v of values) {
    if (v === null || v === undefined || v === '') continue;
    anyValue = true;
    if (v instanceof Date) {
      sawDate = true;
      continue;
    }
    if (typeof v === 'boolean') {
      sawBool = true;
      continue;
    }
    if (typeof v === 'number') {
      sawNumber = true;
      if (!Number.isInteger(v)) sawFloat = true;
      continue;
    }
    sawString = true;
    maxLen = Math.max(maxLen, String(v).length);
  }

  if (!anyValue) return 'VARCHAR(255)';
  if (sawString) return maxLen > 255 ? 'TEXT' : 'VARCHAR(255)';
  if (sawDate) return 'DATETIME';
  if (sawBool && !sawNumber) return 'BOOLEAN';
  if (sawNumber) return sawFloat ? 'DECIMAL(18,4)' : 'INT';
  return 'VARCHAR(255)';
}

function buildCreateTable(keys: string[], data: SheetRow[], opts: GenOptions): string {
  const dialect = opts.dialect;
  const quotedTable = quoteIdent(opts.tableName, dialect);
  const cols = keys.map((k) => {
    const values = data.map((r) => r[k]);
    const type = inferColumnType(values);
    const isId = k.toLowerCase() === 'id';
    return '  ' + quoteIdent(k, dialect) + ' ' + type + (isId ? ' PRIMARY KEY' : '');
  });
  const colsBlock = cols.join(',\n');

  if (dialect === 'mssql') {
    // SQL Server has no CREATE TABLE IF NOT EXISTS — use an OBJECT_ID guard instead
    return (
      `IF OBJECT_ID(N'${quotedTable}', N'U') IS NULL\nBEGIN\n  CREATE TABLE ${quotedTable} (\n` +
      cols.map((c) => '  ' + c).join(',\n') +
      '\n  );\nEND\n'
    );
  }

  if (dialect === 'none') {
    // Unknown target — IF NOT EXISTS isn't guaranteed to be supported, so leave it out
    return 'CREATE TABLE ' + quotedTable + ' (\n' + colsBlock + '\n);\n';
  }

  // MySQL/MariaDB, PostgreSQL and SQLite all support this form
  return 'CREATE TABLE IF NOT EXISTS ' + quotedTable + ' (\n' + colsBlock + '\n);\n';
}

/* ---------- Value formatting for INSERT ---------- */

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function formatDate(d: Date): string {
  return (
    d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' +
    pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds())
  );
}

function formatValue(v: CellValue, blankNull: boolean): string {
  if (v === undefined || v === null) return 'NULL';
  if (v === '') return blankNull ? 'NULL' : "''";
  if (v instanceof Date) return "'" + formatDate(v) + "'";
  if (typeof v === 'boolean') return v ? '1' : '0';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'NULL';
  return "'" + String(v).replace(/'/g, "''") + "'";
}

/* ---------- Top-level SQL generation ---------- */

export function generateSql(headerKeys: string[], rows: SheetRow[], opts: GenOptions): GenResult | null {
  if (rows.length === 0) return null;

  const { keys, data } = buildWorkingData(headerKeys, rows, opts);
  if (keys.length === 0) return null;

  const out: string[] = [];
  let statementCount = 0;

  if (opts.createTable) {
    out.push(buildCreateTable(keys, data, opts));
    statementCount += 1;
  }

  const quotedCols = keys.map((k) => quoteIdent(k, opts.dialect)).join(', ');
  const quotedTable = quoteIdent(opts.tableName, opts.dialect);

  if (opts.insertMode === 'single') {
    data.forEach((row) => {
      const vals = keys.map((k) => formatValue(row[k], opts.blankNull)).join(', ');
      out.push('INSERT INTO ' + quotedTable + ' (' + quotedCols + ') VALUES (' + vals + ');');
      statementCount += 1;
    });
  } else {
    const batchSize = Math.max(1, opts.batchSize || 500);
    for (let i = 0; i < data.length; i += batchSize) {
      const chunk = data.slice(i, i + batchSize);
      const rowsSql = chunk
        .map((row) => '  (' + keys.map((k) => formatValue(row[k], opts.blankNull)).join(', ') + ')')
        .join(',\n');
      out.push('INSERT INTO ' + quotedTable + ' (' + quotedCols + ') VALUES\n' + rowsSql + ';');
      statementCount += 1;
    }
  }

  return { sql: out.join('\n\n'), statementCount, keys, data };
}
