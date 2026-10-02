import React from 'react';

export default function SeasonSelect({ years, year, onChange, disabled }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-muted-foreground">Season</span>
      <select
        className="studio-select"
        value={year}
        onChange={event => onChange(Number(event.target.value))}
        disabled={disabled}
      >
        {years.map(value => (
          <option key={value} value={value}>{value}–{String(value + 1).slice(-2)}</option>
        ))}
      </select>
    </label>
  );
}