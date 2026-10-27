// Minimal inline icon set (stroke icons, 24px grid) — no icon library in the client bundle.
type P = { className?: string };
const base = { fill: "none", stroke: "currentColor", strokeWidth: 1.75, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, viewBox: "0 0 24 24", "aria-hidden": true };

export const IconClinic = ({ className }: P) => (
  <svg {...base} className={className}><path d="M4 21V8l8-5 8 5v13" /><path d="M9 21v-6h6v6" /><path d="M12 7v4M10 9h4" /></svg>
);
export const IconHome = ({ className }: P) => (
  <svg {...base} className={className}><path d="M3 11l9-7 9 7" /><path d="M5 10v10h14V10" /><path d="M10 20v-5h4v5" /></svg>
);
export const IconCalendar = ({ className }: P) => (
  <svg {...base} className={className}><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></svg>
);
export const IconShield = ({ className }: P) => (
  <svg {...base} className={className}><path d="M12 3l8 3v6c0 4.5-3.4 8.2-8 9-4.6-.8-8-4.5-8-9V6l8-3z" /><path d="M9 12l2 2 4-4" /></svg>
);
export const IconAlert = ({ className }: P) => (
  <svg {...base} className={className}><path d="M12 3l10 18H2L12 3z" /><path d="M12 10v5M12 18h.01" /></svg>
);
export const IconArrow = ({ className }: P) => (
  <svg {...base} className={`${className ?? ""} rtl:-scale-x-100`}><path d="M5 12h14M13 6l6 6-6 6" /></svg>
);
export const IconCheck = ({ className }: P) => (
  <svg {...base} className={className}><path d="M5 12l5 5 9-10" /></svg>
);
export const IconGlobe = ({ className }: P) => (
  <svg {...base} className={className}><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.5 3 2.5 15 0 18M12 3c-2.5 3-2.5 15 0 18" /></svg>
);
export const IconPin = ({ className }: P) => (
  <svg {...base} className={className}><path d="M12 21s-7-6.2-7-12a7 7 0 1114 0c0 5.8-7 12-7 12z" /><circle cx="12" cy="9" r="2.5" /></svg>
);
export const IconLock = ({ className }: P) => (
  <svg {...base} className={className}><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 118 0v3" /></svg>
);
export const IconMenu = ({ className }: P) => (
  <svg {...base} className={className}><path d="M4 7h16M4 12h16M4 17h16" /></svg>
);
