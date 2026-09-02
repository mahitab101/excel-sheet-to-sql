import { useRef, useState } from 'react';

interface DropzoneProps {
  fileName: string;
  isLoading: boolean;
  onFile: (file: File) => void;
}

export function Dropzone({ fileName, isLoading, onFile }: DropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  function openPicker() {
    if (isLoading) return;
    inputRef.current?.click();
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    if (isLoading) return;
    const f = e.dataTransfer.files?.[0];
    if (f) onFile(f);
  }

  return (
    <>
      <div
        className={'dropzone' + (dragging ? ' drag' : '') + (isLoading ? ' loading' : '')}
        tabIndex={isLoading ? -1 : 0}
        role="button"
        aria-label="Upload spreadsheet"
        aria-busy={isLoading}
        onClick={openPicker}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            openPicker();
          }
        }}
        onDragEnter={(e) => {
          e.preventDefault();
          if (!isLoading) setDragging(true);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          if (!isLoading) setDragging(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          setDragging(false);
        }}
        onDrop={handleDrop}
      >
        <div className="cellrow">
          <span>A</span>
          <span>B</span>
          <span>C</span>
          <span>D</span>
          <span>E</span>
        </div>
        <div className="rownums">
          <span>1</span>
          <span>2</span>
          <span>3</span>
          <span>4</span>
        </div>

        {isLoading ? (
          <>
            <div className="spinner" aria-hidden="true" />
            <div className="dz-title">Reading spreadsheet…</div>
            <div className="dz-sub">parsing {fileName || 'your file'}</div>
          </>
        ) : (
          <>
            <div className="dz-icon">▦</div>
            <div className="dz-title">Drop .xlsx, .xls or .csv</div>
            <div className="dz-sub">or click to browse</div>
            <div className="dz-file">{fileName}</div>
          </>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        style={{ display: 'none' }}
        disabled={isLoading}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = '';
        }}
      />
    </>
  );
}