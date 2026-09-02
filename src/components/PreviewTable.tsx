import type { SheetRow } from '../lib/sqlGen';

interface PreviewTableProps {
  headerKeys: string[];
  rows: SheetRow[];
}

function colLetter(i: number): string {
  let s = '';
  let n = i + 1;
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function formatPreviewCell(v: SheetRow[string]): { text: string; isNull: boolean } {
  if (v === null || v === undefined || v === '') return { text: 'NULL', isNull: true };
  if (v instanceof Date) return { text: v.toISOString().slice(0, 19).replace('T', ' '), isNull: false };
  return { text: String(v), isNull: false };
}

export function PreviewTable({ headerKeys, rows }: PreviewTableProps) {
  const previewRows = rows.slice(0, 50);

  return (
    <div className="tablewrap">
      <table className="preview">
        <thead>
          <tr className="colletters">
            <th></th>
            {headerKeys.map((_, i) => (
              <th key={i}>{colLetter(i)}</th>
            ))}
          </tr>
          <tr className="colnames">
            <th>#</th>
            {headerKeys.map((k) => (
              <th key={k}>{k}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {previewRows.map((row, idx) => (
            <tr key={idx}>
              <td className="rownum">{idx + 1}</td>
              {headerKeys.map((k) => {
                const cell = formatPreviewCell(row[k]);
                return (
                  <td key={k} className={cell.isNull ? 'null-cell' : undefined}>
                    {cell.text}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
