import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';

// Header block for one control set inside the boundaries card: gold icon
// tile, title, optional badge, and a short description of what it changes.
// When onToggle/open are passed the header carries a collapse toggle.
export function LineupControlHead({ icon: Icon, title, badge, copy, onToggle, open }) {
  return <header className="ll-control-set__head">
    {Icon && <span className="ll-control-set__icon"><Icon size={15} aria-hidden="true" /></span>}
    <div>
      <h3>{title}{badge && <span className="ll-control-set__badge">{badge}</span>}</h3>
      {copy && <p>{copy}</p>}
    </div>
    {onToggle && <button type="button" className="ll-control-set__toggle" aria-expanded={open} aria-label={`${open ? 'Collapse' : 'Expand'} ${title}`} onClick={onToggle}><ChevronDown size={15} aria-hidden="true" /></button>}
  </header>;
}

// Collapse state for one control set, shared by designed sets and the
// fieldsets that mirror hidden source nodes (which must stay mounted).
export function useCollapsible() {
  const [open, setOpen] = useState(true);
  return {
    open,
    toggle: () => setOpen(value => !value),
    className: open ? '' : 'is-collapsed',
    headProps: { open, onToggle: () => setOpen(value => !value) },
  };
}

// Full sub-panel wrapper for control sets that don't need to be fieldsets.
// Collapsible: the body is hidden with CSS, so bound source nodes keep
// living in the DOM while the section is folded.
export default function LineupControlSet({ icon, title, badge, copy, children, className = '' }) {
  const { open, headProps, className: collapsedClass } = useCollapsible();
  return <div className={`ll-control-set ${collapsedClass} ${className}`}>
    <LineupControlHead icon={icon} title={title} badge={badge} copy={copy} {...headProps} />
    <div className="ll-control-set__body">{children}</div>
  </div>;
}