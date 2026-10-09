import React from 'react';
import { useLocation } from 'react-router-dom';
import { AnimatePresence, LazyMotion, domAnimation, m, useReducedMotion } from 'framer-motion';

// Smooth slide page transitions: the incoming view slides in from the right
// while the outgoing view eases out to the left. AnimatePresence holds the
// leaving view until the slide finishes; reduced-motion users get an instant
// swap instead. Works with react-router history navigation, including the
// iOS back gesture (swipe edge → popstate → router re-renders the key).
export default function PageTransition({ children }) {
  const { pathname } = useLocation();
  const reducedMotion = useReducedMotion();
  if (reducedMotion) return <div className="min-w-0">{children}</div>;
  return (
    <LazyMotion features={domAnimation}>
      <AnimatePresence mode="wait" initial={false}>
        <m.div
          key={pathname}
          className="min-w-0"
          initial={{ opacity: 0, x: 32 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -32 }}
          transition={{ duration: 0.22, ease: [0.2, 0.8, 0.3, 1] }}
        >
          {children}
        </m.div>
      </AnimatePresence>
    </LazyMotion>
  );
}