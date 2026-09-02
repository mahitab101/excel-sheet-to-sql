import { highlightSql } from '../lib/highlightSql';

interface SqlOutputProps {
  sql: string;
  onCopy: () => void;
  onDownload: () => void;
}

export function SqlOutput({ sql, onCopy, onDownload }: SqlOutputProps) {
  return (
    <>
      <div className="sql-toolbar">
        <h2 style={{ margin: 0 }}>Generated SQL</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onCopy}>Copy</button>
          <button onClick={onDownload}>Download .sql</button>
        </div>
      </div>
      <div className="sql-out">{highlightSql(sql)}</div>

      {sql && (
        <div style={{ marginTop: 12, textAlign: 'right' }}>
          <button className="primary" onClick={onCopy}>
            Copy generated SQL
          </button>
        </div>
      )}
    </>
  );
}
