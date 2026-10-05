import React from 'react';

export default function LineupSection({ id, title, number, children, className = '', headingId, ...props }) {
  return <section id={id} aria-labelledby={headingId || `${id}Heading`} className={`ll-native-card ${className}`} {...props}>
    <header className="ll-native-card__heading"><span className="ll-native-index">{number}</span><h2 id={headingId || `${id}Heading`}>{title}</h2></header>
    {children}
  </section>;
}