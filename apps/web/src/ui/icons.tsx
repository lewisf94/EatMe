// Small inline line-icons (Lucide-style), so there's no runtime dependency and
// nothing to fetch. Colour follows `currentColor`; size is set in CSS.
import type { SVGProps, ReactNode } from "react";

const base = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

const S = (props: SVGProps<SVGSVGElement>, d: ReactNode) => (
  <svg {...base} {...props}>
    {d}
  </svg>
);

/** Use-by (safety) — a padlock. */
export const IconLock = (p: SVGProps<SVGSVGElement>) =>
  S(p, [
    <rect key="a" x="5" y="11" width="14" height="9" rx="2" />,
    <path key="b" d="M8 11V8a4 4 0 0 1 8 0v3" />,
  ]);

/** Best-before (quality) — a leaf. */
export const IconLeaf = (p: SVGProps<SVGSVGElement>) =>
  S(p, [
    <path key="a" d="M11 20A7 7 0 0 1 4 13c4 0 7 2 7 7Z" />,
    <path key="b" d="M20 5c0 7-4 10-9 11 1-6 4-9 9-11Z" />,
  ]);

/** Opened life — a droplet. */
export const IconDrop = (p: SVGProps<SVGSVGElement>) =>
  S(p, <path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11Z" />);

/** Plenty of time / neutral — a clock. */
export const IconClock = (p: SVGProps<SVGSVGElement>) =>
  S(p, [<circle key="a" cx="12" cy="12" r="9" />, <path key="b" d="M12 8v5l3 2" />]);

export const IconHome = (p: SVGProps<SVGSVGElement>) =>
  S(p, [<path key="a" d="M4 11l8-6 8 6" />, <path key="b" d="M6 10v9h12v-9" />]);

export const IconList = (p: SVGProps<SVGSVGElement>) => S(p, <path d="M4 6h16M4 12h16M4 18h16" />);

export const IconPlus = (p: SVGProps<SVGSVGElement>) =>
  S({ ...p, strokeWidth: 2.3 }, <path d="M12 5v14M5 12h14" />);

export const IconSearch = (p: SVGProps<SVGSVGElement>) =>
  S(p, [<circle key="a" cx="11" cy="11" r="7" />, <path key="b" d="m20 20-3-3" />]);

export const IconSliders = (p: SVGProps<SVGSVGElement>) =>
  S(p, <path d="M4 6h16M7 12h10M10 18h4" />);

export const IconMenu = (p: SVGProps<SVGSVGElement>) => S(p, <path d="M4 7h16M4 12h16M4 17h16" />);

export const IconBack = (p: SVGProps<SVGSVGElement>) => S(p, <path d="M15 5l-7 7 7 7" />);

export const IconEdit = (p: SVGProps<SVGSVGElement>) =>
  S(p, [<path key="a" d="M4 20h4L18 10l-4-4L4 16z" />, <path key="b" d="M13 7l4 4" />]);

export const IconCamera = (p: SVGProps<SVGSVGElement>) =>
  S(p, [
    <path
      key="a"
      d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z"
    />,
    <circle key="b" cx="12" cy="13" r="3.2" />,
  ]);

export const IconReceipt = (p: SVGProps<SVGSVGElement>) =>
  S(p, [
    <path key="a" d="M6 3h12v18l-2.5-1.5L13 21l-2.5-1.5L8 21l-2-1.5V3Z" />,
    <path key="b" d="M9 8h6M9 12h6" />,
  ]);

export const IconCheck = (p: SVGProps<SVGSVGElement>) =>
  S({ ...p, strokeWidth: 2.4 }, <path d="M5 12.5l4.5 4.5L19 6.5" />);

export const IconMinus = (p: SVGProps<SVGSVGElement>) =>
  S({ ...p, strokeWidth: 2.3 }, <path d="M5 12h14" />);

export const IconGear = (p: SVGProps<SVGSVGElement>) =>
  S(p, [
    <circle key="a" cx="12" cy="12" r="3" />,
    <path
      key="b"
      d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 6.9 19l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0-1.2-2.9H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 5 6.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H10a1.7 1.7 0 0 0 1-1.6V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V10a1.7 1.7 0 0 0 1.6 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"
    />,
  ]);
