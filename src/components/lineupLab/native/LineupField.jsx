import React from 'react';

export default function LineupField({ id, label, options, value, help, helpId, fieldId, labelId, hidden = false, className = '', ...props }) {
  return (
    <label id={fieldId} hidden={hidden} className={`field ${className}`}>
      <span id={labelId}>{label}</span>
      {options ? <select id={id} defaultValue={value} aria-describedby={helpId} {...props}>{options.map(([key, text, disabled]) => <option key={key} value={key} disabled={disabled}>{text}</option>)}</select>
        : <input id={id} defaultValue={value} aria-describedby={helpId} type="number" {...props} />}
      {helpId && <small id={helpId}>{help}</small>}
    </label>
  );
}