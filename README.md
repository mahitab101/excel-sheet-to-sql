# Sheet → SQL

Drop any spreadsheet (.xlsx / .xls / .csv), get SQL `INSERT` statements. Everything runs
client-side in the browser — nothing is uploaded anywhere.

Built with **React + TypeScript + Vite**.

## Run it

```bash
npm install
npm run dev
```

Then open the printed local URL (usually http://localhost:5173).

> **Note on `npm audit`:** the `xlsx` package on the npm registry carries known,
> unpatched advisories (prototype pollution, ReDoS) — SheetJS publishes fixes on
> their own site/CDN rather than to npm. Since parsing happens entirely client-side
> against files you choose yourself, the practical risk here is low, but if you want
> the patched build, replace the `xlsx` dependency in `package.json` with SheetJS's
> hosted tarball, e.g. `"xlsx": "https://cdn.sheetjs.com/xlsx-0.20.4/xlsx-0.20.4.tgz"`,
> then `npm install` again.

## Build for production

```bash
npm run build
npm run preview   # serve the production build locally
```

## Features

- Drag-and-drop or click-to-browse upload for `.xlsx`, `.xls`, `.csv`
- Multi-sheet workbooks: pick which sheet to convert
- **Header-row auto-detection** — skips logo/title blocks above the real header row
  (scans the first ~25 rows for the one with the most filled-in cells), with a manual
  override if it guesses wrong
- Live spreadsheet-style preview of the first 50 parsed rows
- SQL dialect switch: MySQL/MariaDB, PostgreSQL/SQLite, SQL Server, or unquoted/generic
  — `CREATE TABLE` existence checks are generated correctly per dialect (SQL Server
  doesn't support `CREATE TABLE IF NOT EXISTS`, so it gets an `OBJECT_ID` guard instead)
- Multi-row batched `INSERT`s (configurable batch size) or one `INSERT` per row
- Auto-generate a sequential `ID` column when one is missing or has blanks
- Flatten cells containing a JSON array of objects into extra columns
- Optional `CREATE TABLE` statement with inferred column types
  (`INT` / `DECIMAL` / `DATETIME` / `BOOLEAN` / `VARCHAR` / `TEXT`)
- Syntax-highlighted SQL output, copy-to-clipboard, and `.sql` download

## Project structure

```
src/
  lib/
    sqlGen.ts        // spreadsheet parsing + SQL generation (framework-agnostic)
    highlightSql.tsx // SQL syntax highlighter (returns React nodes)
  components/
    Dropzone.tsx      // drag-and-drop / click-to-browse file input
    Toggle.tsx         // reusable switch control
    PreviewTable.tsx   // spreadsheet-style data preview
    SqlOutput.tsx       // highlighted SQL box + copy/download
  App.tsx            // state + layout
  styles/index.css   // design tokens & styling
```
