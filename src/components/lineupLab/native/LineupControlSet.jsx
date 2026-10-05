import React from 'react';

// Header block for one control set inside the boundaries card: gold icon
// tile, title, optional badge, and a short description of what it changes.
export function LineupControlHead({ icon: Icon, title, badge, copy }) {
  return <header className="ll-control-set__head">
    {Icon && <span className="ll-control-set__icon"><Icon size={15} aria-hidden="true" /></span>}
    <div>
      <h3>{title}{badge && <span className="ll-control-set__badge">{badge}</span>}</h3>
      {copy && <p>{copy}</p>}
    </div>
  </header>;
}

// Full sub-panel wrapper for control sets that don't need to be fieldsets.
export default function LineupControlSet({ icon, title, badge, copy, children, className = '' }) {
  return <div className={`ll-control-set ${className}`}>
    <LineupControlHead icon={icon} title={title} badge={badge} copy={copy} />
    <div className="ll-control-set__body">{children}</div>
  </div>;
}