import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, Minus, Plus } from 'lucide-react';
import LineupField from '@/components/lineupLab/native/LineupField';

// Unbound control bridge. Every original site control keeps living in the DOM
// (as a hidden "source" node) so the site controller binds and drives it
// exactly as before; the designed React controls below mirror its state and
// push user actions back into it with native change/input/click events.

const dispatch = (el, type) => el.dispatchEvent(new Event(type, { bubbles: true }));

/* ---- Hidden source nodes (rendered for the site controller) ---- */

export function SourceField(props) {
  return <LineupField className="ll-source" aria-hidden="true" {...props} />;
}

export function SourceButton({ id, type = 'button', hidden = false }) {
  return <button id={id} type={type} hidden={hidden || undefined} className="ll-source" aria-hidden="true" />;
}

export function SourceRange({ id, label, ...props }) {
  return <label className="range-field ll-source" aria-hidden="true"><span><strong>{label}</strong></span><input id={id} type="range" data-family={String(id).replace('familyWeight-', '')} {...props} /><output>0</output></label>;
}

export function SourcePresets({ presets }) {
  return <div className="preset-grid ll-source" id="presetGrid">{presets.map(([key, title, copy], index) => <button key={key} type="button" data-preset={key} className={`preset-card ${index === 0 ? 'is-active' : index > 2 ? 'detailed-only' : ''}`} aria-pressed={index === 0}><strong>{title}</strong><span>{copy}</span></button>)}</div>;
}

/* ---- Mirror state for one source control ---- */

export function useSource(sourceId, fieldId) {
  const [state, setState] = useState({ ready: false, value: '', options: [], disabled: false, hidden: true, min: '', max: '', step: '' });
  useEffect(() => {
    let observer = null;
    let timer = null;
    let interval = null;
    const sync = () => {
      const el = document.getElementById(sourceId);
      if (!el) return;
      const label = fieldId ? document.getElementById(fieldId) : null;
      const next = {
        ready: true,
        value: el.value ?? '',
        options: el.tagName === 'SELECT' ? [...el.options].map(option => ({ value: option.value, label: option.text, disabled: option.disabled })) : [],
        disabled: el.disabled,
        hidden: Boolean((label && label.hidden) || el.hidden),
        min: el.min ?? '',
        max: el.max ?? '',
        step: el.step ?? '',
      };
      setState(previous => {
        const same = previous.ready === next.ready && previous.value === next.value && previous.disabled === next.disabled && previous.hidden === next.hidden
          && previous.min === next.min && previous.max === next.max && previous.step === next.step
          && previous.options.length === next.options.length
          && previous.options.every((option, index) => option.value === next.options[index].value && option.label === next.options[index].label && option.disabled === next.options[index].disabled);
        return same ? previous : next;
      });
    };
    const watchProperty = (el, name) => {
      const descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), name);
      if (!descriptor?.set || el[`__llWatched_${name}`]) return;
      el[`__llWatched_${name}`] = true;
      Object.defineProperty(el, name, {
        get() { return descriptor.get.call(this); },
        set(value) { descriptor.set.call(this, value); this.dispatchEvent(new Event('ll-source-value')); },
      });
    };
    const attach = () => {
      const el = document.getElementById(sourceId);
      if (!el) { timer = setTimeout(attach, 200); return; }
      watchProperty(el, 'value');
      if (el.tagName === 'SELECT') watchProperty(el, 'selectedIndex');
      observer = new MutationObserver(sync);
      observer.observe(el, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled', 'hidden', 'class'] });
      const label = fieldId ? document.getElementById(fieldId) : null;
      if (label) observer.observe(label, { attributes: true, attributeFilter: ['hidden', 'class'] });
      el.addEventListener('change', sync);
      el.addEventListener('input', sync);
      el.addEventListener('ll-source-value', sync);
      interval = setInterval(sync, 1500);
      sync();
    };
    attach();
    return () => { clearTimeout(timer); clearInterval(interval); observer?.disconnect(); };
  }, [sourceId, fieldId]);
  return state;
}

export function useSourceGroup(gridId, selector) {
  const [items, setItems] = useState([]);
  useEffect(() => {
    let observer = null;
    let timer = null;
    const sync = () => {
      const grid = document.getElementById(gridId);
      if (!grid) return;
      setItems([...grid.querySelectorAll(selector)].map(el => ({ key: el.dataset.preset ?? el.id, active: el.classList.contains('is-active'), disabled: el.disabled })));
    };
    const attach = () => {
      const grid = document.getElementById(gridId);
      if (!grid) { timer = setTimeout(attach, 200); return; }
      observer = new MutationObserver(sync);
      observer.observe(grid, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'disabled'] });
      sync();
    };
    attach();
    return () => { clearTimeout(timer); observer?.disconnect(); };
  }, [gridId, selector]);
  return items;
}

const writeSource = (sourceId, value, events) => {
  const el = document.getElementById(sourceId);
  if (!el) return false;
  el.value = value;
  events.forEach(type => dispatch(el, type));
  return true;
};

/* ---- Designed controls ---- */

export function BoundSegmented({ sourceId, fieldId, label, labels, columns }) {
  const source = useSource(sourceId, fieldId);
  const pick = value => { const el = document.getElementById(sourceId); if (el && !el.disabled) writeSource(sourceId, value, ['change']); };
  if (!source.ready || source.hidden || !source.options.length) return null;
  return <div className="ll-control">
    {label && <span className="ll-control__label">{label}</span>}
    <div className="ll-segmented" style={columns ? { '--ll-segmented-cols': columns } : undefined}>
      {source.options.map(option => <button key={option.value} type="button" className={option.value === source.value ? 'is-on' : ''} disabled={option.disabled || source.disabled} onClick={() => pick(option.value)}>{labels?.[option.value] ?? option.label}</button>)}
    </div>
  </div>;
}

export function BoundSelect({ sourceId, fieldId, label, help, helpId }) {
  const source = useSource(sourceId, fieldId);
  const pick = value => writeSource(sourceId, value, ['change']);
  if (!source.ready || source.hidden) return null;
  return <div className="ll-control">
    {label && <span className="ll-control__label">{label}</span>}
    <span className="ll-select-shell">
      <select className="ll-designed-select" data-ll-designed="true" value={source.value} disabled={source.disabled} onChange={event => pick(event.target.value)} aria-label={label}>
        {source.options.map(option => <option key={option.value} value={option.value} disabled={option.disabled}>{option.label}</option>)}
      </select>
      <ChevronDown size={14} aria-hidden="true" />
    </span>
    {help && <small id={helpId} className="ll-control__help">{help}</small>}
  </div>;
}

export function BoundStepper({ sourceId, fieldId, label, placeholder }) {
  const source = useSource(sourceId, fieldId);
  const [text, setText] = useState('');
  const focused = useRef(false);
  useEffect(() => { if (!focused.current && source.ready) setText(source.value); }, [source.ready, source.value]);
  const commit = value => { writeSource(sourceId, value, ['input', 'change']); setText(value); };
  const nudge = direction => {
    const el = document.getElementById(sourceId);
    if (!el || el.disabled) return;
    const stepSize = parseFloat(el.step) || 1;
    const low = el.min !== '' && el.min != null ? parseFloat(el.min) : -Infinity;
    const high = el.max !== '' && el.max != null ? parseFloat(el.max) : Infinity;
    const typed = parseFloat(text);
    const base = Number.isFinite(typed) ? typed : (Number.isFinite(parseFloat(el.value)) ? parseFloat(el.value) : (low === -Infinity ? 0 : low));
    const next = Math.min(high, Math.max(low, base + direction * stepSize));
    if (Number.isFinite(next)) commit(String(Math.round(next * 100) / 100));
  };
  if (!source.ready || source.hidden) return null;
  return <div className="ll-control">
    {label && <span className="ll-control__label">{label}</span>}
    <div className="ll-stepper">
      <button type="button" aria-label="Decrease" disabled={source.disabled} onClick={() => nudge(-1)}><Minus size={13} /></button>
      <input type="number" data-ll-designed="true" value={text} placeholder={placeholder} min={source.min} max={source.max} step={source.step} disabled={source.disabled} aria-label={label}
        onChange={event => setText(event.target.value)}
        onFocus={() => { focused.current = true; }}
        onBlur={() => { focused.current = false; if (text !== source.value) commit(text); }}
        onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); commit(text); } }} />
      <button type="button" aria-label="Increase" disabled={source.disabled} onClick={() => nudge(1)}><Plus size={13} /></button>
    </div>
  </div>;
}

export function BoundRange({ sourceId, label, copy }) {
  const source = useSource(sourceId);
  const [value, setValue] = useState(0);
  useEffect(() => { if (source.ready) setValue(Number(source.value) || 0); }, [source.ready, source.value]);
  const commit = next => {
    const el = document.getElementById(sourceId);
    if (!el || el.disabled) return;
    el.value = String(next);
    dispatch(el, 'input');
    dispatch(el, 'change');
    setValue(next);
  };
  if (!source.ready || source.hidden) return null;
  return <div className="ll-range">
    <div className="ll-range__head"><span><strong>{label}</strong>{copy && <small>{copy}</small>}</span><output>{value}</output></div>
    <input type="range" data-ll-designed="true" min="0" max="100" step="1" value={value} disabled={source.disabled} onChange={event => commit(event.target.value)} aria-label={label} />
  </div>;
}

export function BoundButton({ sourceId, children, className = '', ...props }) {
  const source = useSource(sourceId);
  if (!source.ready || source.hidden) return null;
  return <button type="button" className={className} disabled={source.disabled} onClick={() => { const el = document.getElementById(sourceId); if (el) el.click(); }} {...props}>{children}</button>;
}