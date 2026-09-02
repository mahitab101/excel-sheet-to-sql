import type { ReactNode } from 'react';

// Group 1: string literal, Group 2: NULL, Group 3: keyword, Group 4: number
const TOKEN_RE =
  /('(?:[^']|'')*')|(\bNULL\b)|(\bIF OBJECT_ID\b|\bIS NULL\b|\bBEGIN\b|\bEND\b|\bCREATE TABLE IF NOT EXISTS\b|\bCREATE TABLE\b|\bINSERT INTO\b|\bVALUES\b|\bPRIMARY KEY\b|\bNOT NULL\b)|(\b\d+(?:\.\d+)?\b)/g;

function highlightLine(line: string, lineIdx: number): ReactNode {
  if (line.trim().startsWith('--')) {
    return (
      <span key={lineIdx} className="com">
        {line}
      </span>
    );
  }

  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let tokenIdx = 0;
  TOKEN_RE.lastIndex = 0;

  while ((match = TOKEN_RE.exec(line)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(line.slice(lastIndex, match.index));
    }
    const [full, str, nul, kw] = match;
    const key = `${lineIdx}-${tokenIdx++}`;
    if (str !== undefined) {
      nodes.push(
        <span key={key} className="str">
          {str}
        </span>,
      );
    } else if (nul !== undefined) {
      nodes.push(
        <span key={key} className="nul">
          {nul}
        </span>,
      );
    } else if (kw !== undefined) {
      nodes.push(
        <span key={key} className="kw">
          {kw}
        </span>,
      );
    } else {
      nodes.push(
        <span key={key} className="num">
          {full}
        </span>,
      );
    }
    lastIndex = match.index + full.length;
  }
  if (lastIndex < line.length) nodes.push(line.slice(lastIndex));

  return <span key={lineIdx}>{nodes}</span>;
}

export function highlightSql(sql: string): ReactNode {
  const lines = sql.split('\n');
  return lines.map((line, i) => (
    <div key={i}>
      {highlightLine(line, i)}
      {line === '' ? '\u00A0' : null}
    </div>
  ));
}
