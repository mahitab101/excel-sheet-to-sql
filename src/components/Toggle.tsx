interface ToggleProps {
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

export function Toggle({ label, description, checked, onChange }: ToggleProps) {
  return (
    <div className="toggle-row">
      <div>
        <div className="label">{label}</div>
        <div className="desc">{description}</div>
      </div>
      <label className="switch">
        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <span className="track">
          <span className="thumb" />
        </span>
      </label>
    </div>
  );
}
