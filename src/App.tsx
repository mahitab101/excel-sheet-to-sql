import { useEffect, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  detectHeaderRow,
  generateSql,
  parseSheet,
  sanitizeIdentifier,
  type Dialect,
  type GenResult,
  type InsertMode,
  type SheetRow,
} from './lib/sqlGen';
import { Dropzone } from './components/Dropzone';
import { Toggle } from './components/Toggle';
import { PreviewTable } from './components/PreviewTable';
import { SqlOutput } from './components/SqlOutput';
import Me from './components/Me';

export default function App() {
  // Source
  const [workbook, setWorkbook] = useState<XLSX.WorkBook | null>(null);
  const [fileName, setFileName] = useState('');
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [currentSheet, setCurrentSheet] = useState('');
  const [headerRowValue, setHeaderRowValue] = useState(1);
  const [headerKeys, setHeaderKeys] = useState<string[]>([]);
  const [rows, setRows] = useState<SheetRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Target / options
  const [tableName, setTableName] = useState('my_table');
  const [dialect, setDialect] = useState<Dialect>('mysql');
  const [insertMode, setInsertMode] = useState<InsertMode>('batch');
  const [batchSize, setBatchSize] = useState(500);
  const [optAutoId, setOptAutoId] = useState(true);
  const [optBlankNull, setOptBlankNull] = useState(true);
  const [optFlatten, setOptFlatten] = useState(false);
  const [optCreateTable, setOptCreateTable] = useState(true);

  // Output
  const [result, setResult] = useState<GenResult | null>(null);

  // Toast
  const [toastMsg, setToastMsg] = useState('');
  const [toastShow, setToastShow] = useState(false);
  const toastTimer = useRef<number | null>(null);

  function showToast(msg: string) {
    setToastMsg(msg);
    setToastShow(true);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToastShow(false), 1800);
  }
  useEffect(() => () => {
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
  }, []);

  function loadSheetFromWorkbook(wb: XLSX.WorkBook, sheetName: string) {
    const ws = wb.Sheets[sheetName];
    const detected = detectHeaderRow(ws);
    const parsed = parseSheet(ws, detected);
    setCurrentSheet(sheetName);
    setHeaderRowValue(detected + 1);
    setHeaderKeys(parsed.headerKeys);
    setRows(parsed.rows);
    setResult(null);
  }

  function handleFile(file: File) {
    setFileName(file.name);
    setIsLoading(true);
    const reader = new FileReader();

    reader.onload = (e) => {
      // XLSX.read is synchronous and can briefly block on large files — defer
      // it a tick so the browser gets a chance to paint the loading state first.
      setTimeout(() => {
        try {
          const data = new Uint8Array(e.target!.result as ArrayBuffer);
          const wb = XLSX.read(data, { type: 'array', cellDates: true });
          setWorkbook(wb);
          setSheetNames(wb.SheetNames);
          const base = file.name.replace(/\.[^.]+$/, '');
          setTableName(sanitizeIdentifier(base) || 'my_table');
          loadSheetFromWorkbook(wb, wb.SheetNames[0]);
        } catch (err) {
          showToast('Could not read that file: ' + (err instanceof Error ? err.message : String(err)));
        } finally {
          setIsLoading(false);
        }
      }, 0);
    };

    reader.onerror = () => {
      showToast('Could not read that file');
      setIsLoading(false);
    };

    reader.readAsArrayBuffer(file);
  }

  function handleSheetChange(name: string) {
    if (!workbook) return;
    loadSheetFromWorkbook(workbook, name);
  }

  function handleHeaderRowChange(value: number) {
    setHeaderRowValue(value);
    if (!workbook || !currentSheet) return;
    const ws = workbook.Sheets[currentSheet];
    const idx = Math.max(1, value || 1) - 1;
    try {
      const parsed = parseSheet(ws, idx);
      setHeaderKeys(parsed.headerKeys);
      setRows(parsed.rows);
      setResult(null);
    } catch {
      showToast('That header row is out of range for this sheet');
    }
  }

  function handleGenerate() {
    if (rows.length === 0) {
      showToast('Load a spreadsheet first');
      return;
    }
    const res = generateSql(headerKeys, rows, {
      tableName: sanitizeIdentifier(tableName.trim() || 'my_table'),
      dialect,
      insertMode,
      batchSize,
      autoId: optAutoId,
      blankNull: optBlankNull,
      flatten: optFlatten,
      createTable: optCreateTable,
    });
    if (!res) {
      showToast('No columns detected');
      return;
    }
    setResult(res);
  }

  async function handleCopy() {
    if (!result) {
      showToast('Nothing to copy yet');
      return;
    }
    try {
      await navigator.clipboard.writeText(result.sql);
      showToast('SQL copied to clipboard');
    } catch {
      showToast('Copy failed — select the text manually');
    }
  }

  function handleDownload() {
    if (!result) {
      showToast('Nothing to download yet');
      return;
    }
    const name = sanitizeIdentifier(tableName.trim() || 'my_table');
    const blob = new Blob([result.sql], { type: 'text/sql' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name + '.sql';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function handleReset() {
    setWorkbook(null);
    setFileName('');
    setSheetNames([]);
    setCurrentSheet('');
    setHeaderRowValue(1);
    setHeaderKeys([]);
    setRows([]);
    setTableName('my_table');
    setResult(null);
  }

  const hasData = rows.length > 0 && headerKeys.length > 0;
  const statRows = result ? result.data.length : rows.length;
  const statCols = result ? result.keys.length : headerKeys.length;
  const statStatements = result ? result.statementCount : 0;

  return (
    <div className="wrap">
      <header className="top">
        <div className="brand">
          <div className="brand-mark">SQL</div>
          <div>
            <h1>
              Sheet <span>→</span> SQL
            </h1>
            <div className="tagline">Drop any spreadsheet, get INSERT statements. Nothing leaves your browser.</div>
          </div>
        </div>
        <div className="eyebrow">{fileName ? `${fileName}  ·  ${currentSheet}` : 'no file loaded'}</div>
      </header>

      <div className="grid">
        {/* LEFT: controls */}
        <div>
          <div className="panel">
            <h2>
              <span className="n">01</span> Source file
            </h2>

            <Dropzone fileName={fileName} isLoading={isLoading} onFile={handleFile} />

            {sheetNames.length > 1 && (
              <div>
                <label htmlFor="sheetPicker">Sheet</label>
                <select id="sheetPicker" value={currentSheet} onChange={(e) => handleSheetChange(e.target.value)}>
                  {sheetNames.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {workbook && (
              <div>
                <label htmlFor="headerRowInput">Header row</label>
                <input
                  type="number"
                  id="headerRowInput"
                  min={1}
                  value={headerRowValue}
                  onChange={(e) => handleHeaderRowChange(parseInt(e.target.value, 10) || 1)}
                />
                <div className="dz-sub" style={{ textAlign: 'left', marginTop: 5 }}>
                  Row where your column titles actually are. Auto-detected — adjust if a logo or title block above it
                  threw it off.
                </div>
              </div>
            )}
          </div>

          <div className="panel">
            <h2>
              <span className="n">02</span> Target
            </h2>

            <label htmlFor="tableName">Table name</label>
            <input
              type="text"
              id="tableName"
              placeholder="my_table"
              value={tableName}
              onChange={(e) => setTableName(e.target.value)}
            />

            <label htmlFor="dialect">SQL dialect</label>
            <select id="dialect" value={dialect} onChange={(e) => setDialect(e.target.value as Dialect)}>
              <option value="mysql">MySQL / MariaDB ( `ident` )</option>
              <option value="postgres">PostgreSQL / SQLite ( "ident" )</option>
              <option value="mssql">SQL Server ( [ident] )</option>
              <option value="none">Generic — no quoting</option>
            </select>

            <div className="field-row">
              <div>
                <label htmlFor="insertMode">Insert style</label>
                <select
                  id="insertMode"
                  value={insertMode}
                  onChange={(e) => setInsertMode(e.target.value as InsertMode)}
                >
                  <option value="batch">Multi-row batches</option>
                  <option value="single">One INSERT per row</option>
                </select>
              </div>
              <div>
                <label htmlFor="batchSize">Rows / batch</label>
                <input
                  type="number"
                  id="batchSize"
                  min={1}
                  max={5000}
                  value={batchSize}
                  onChange={(e) => setBatchSize(parseInt(e.target.value, 10) || 500)}
                />
              </div>
            </div>
          </div>

          <div className="panel">
            <h2>
              <span className="n">03</span> Options
            </h2>

            <Toggle
              label="Auto-generate ID"
              description="Fill a missing/blank ID column with sequential numbers"
              checked={optAutoId}
              onChange={setOptAutoId}
            />
            <Toggle
              label="Blank text → NULL"
              description="Empty strings become NULL instead of ''"
              checked={optBlankNull}
              onChange={setOptBlankNull}
            />
            <Toggle
              label="Flatten JSON cells"
              description="Expand cells holding a JSON array of objects into extra columns"
              checked={optFlatten}
              onChange={setOptFlatten}
            />
            <Toggle
              label="Include CREATE TABLE"
              description="Infer column types and prepend a CREATE TABLE statement"
              checked={optCreateTable}
              onChange={setOptCreateTable}
            />
          </div>

          <div className="btn-row">
            <button className="primary" disabled={!hasData} onClick={handleGenerate}>
              Generate SQL
            </button>
            <button className="ghost" onClick={handleReset}>
              Reset
            </button>
          </div>
        </div>

        {/* RIGHT: preview + output */}
        <div>
          <div className="panel">
            {!hasData ? (
              <div className="empty-state">
                <div className="glyph">[ ]</div>
                <div className="t1">Nothing loaded yet</div>
                <div className="t2">
                  Add a spreadsheet on the left. You'll see a live preview of the parsed rows here, then your
                  generated SQL below it.
                </div>
              </div>
            ) : (
              <div>
                <div className="stats">
                  <div className="stat">
                    <div className="v">{statRows}</div>
                    <div className="k">rows</div>
                  </div>
                  <div className="stat">
                    <div className="v">{statCols}</div>
                    <div className="k">columns</div>
                  </div>
                  <div className="stat">
                    <div className="v">{statStatements}</div>
                    <div className="k">SQL statements</div>
                  </div>
                </div>

                <h2
                  style={{
                    fontFamily: 'var(--mono)',
                    fontSize: 12,
                    textTransform: 'uppercase',
                    letterSpacing: '.1em',
                    color: 'var(--muted)',
                    margin: '0 0 10px',
                  }}
                >
                  Preview{' '}
                  <span style={{ color: 'var(--muted-2)', textTransform: 'none', letterSpacing: 0 }}>
                    — first 50 rows
                  </span>
                </h2>
                <PreviewTable headerKeys={headerKeys} rows={rows} />

                {result && <SqlOutput sql={result.sql} onCopy={handleCopy} onDownload={handleDownload} />}
              </div>
            )}
          </div>
        </div>
      </div>

      <footer>runs entirely client-side — your file is never uploaded anywhere
      <Me />
      </footer>
      <div className={'toast' + (toastShow ? ' show' : '')}>{toastMsg}</div>
    </div>
  );
}