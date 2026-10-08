import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import ToolEmblem from '@/components/djhc/ToolEmblem';
import { findStudioTool } from '@/components/studio/workbenches';

export default function DrawerLinkGroup({ label, items, onClose }) {
  const { pathname } = useLocation();
  const owner = findStudioTool(pathname)?.workbench.path;
  return <section className="site-nav__group" aria-label={label}>
    <h2 className="site-nav__eyebrow">{label}</h2>
    <ul className="primary-nav__list">{items.map(item => {
      const active = pathname === item.path || pathname.startsWith(`${item.path}/`) || owner === item.path;
      return <li key={item.path} className="primary-nav__item">
        <Link to={item.path} className={`primary-nav__link${active ? ' active' : ''}`} aria-current={active ? 'page' : undefined} onClick={onClose}>
          <ToolEmblem emblem={item.emblem} label={item.title} className="fan-tools-primary__emblem" />
          <span className="fan-tools-primary__label">{item.title}</span>
        </Link>
      </li>;
    })}</ul>
  </section>;
}