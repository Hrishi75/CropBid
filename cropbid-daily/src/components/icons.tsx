// Stroke icons, drawn rather than pulled from a font so they inherit colour and
// stroke weight from the call site. Every one is a 24-unit square viewBox, so
// `size` is the rendered edge and nothing needs per-icon scaling.

import Svg, { Circle, Path } from 'react-native-svg';

export interface IcoProps {
  size?: number;
  color?: string;
  /** Stroke width, in viewBox units. Bumped for a selected/active state. */
  sw?: number;
}

const base = (p: IcoProps) => ({
  width: p.size ?? 20,
  height: p.size ?? 20,
  viewBox: '0 0 24 24',
  fill: 'none',
});

const stroke = (p: IcoProps) => ({
  stroke: p.color ?? 'currentColor',
  strokeWidth: p.sw ?? 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
});

export function IconSearch(p: IcoProps) {
  return (
    <Svg {...base(p)}>
      <Circle cx="11" cy="11" r="7" {...stroke(p)} />
      <Path d="M20 20l-3.5-3.5" {...stroke(p)} />
    </Svg>
  );
}

export function IconChevronDown(p: IcoProps) {
  return (
    <Svg {...base(p)}>
      <Path d="M6 9l6 6 6-6" {...stroke(p)} />
    </Svg>
  );
}

export function IconChevronRight(p: IcoProps) {
  return (
    <Svg {...base(p)}>
      <Path d="M9 6l6 6-6 6" {...stroke(p)} />
    </Svg>
  );
}

export function IconArrowLeft(p: IcoProps) {
  return (
    <Svg {...base(p)}>
      <Path d="M19 12H5M11 18l-6-6 6-6" {...stroke(p)} />
    </Svg>
  );
}

export function IconPin(p: IcoProps) {
  return (
    <Svg {...base(p)}>
      <Path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 1116 0z" {...stroke(p)} />
      <Circle cx="12" cy="10" r="2.6" {...stroke(p)} />
    </Svg>
  );
}

/** Verified. A shield rather than a tick, so it does not read as "in stock". */
export function IconShield(p: IcoProps) {
  return (
    <Svg {...base(p)}>
      <Path d="M12 3l7 3v5.5c0 4.4-3 8.1-7 9.5-4-1.4-7-5.1-7-9.5V6l7-3z" {...stroke(p)} />
      <Path d="M9 12l2 2 4-4" {...stroke(p)} />
    </Svg>
  );
}

export function IconClock(p: IcoProps) {
  return (
    <Svg {...base(p)}>
      <Circle cx="12" cy="12" r="8.5" {...stroke(p)} />
      <Path d="M12 7.5V12l3 1.8" {...stroke(p)} />
    </Svg>
  );
}

export function IconPlus(p: IcoProps) {
  return (
    <Svg {...base(p)}>
      <Path d="M12 5v14M5 12h14" {...stroke(p)} />
    </Svg>
  );
}

/** Organic. A leaf, used only where the listing actually carries the flag. */
export function IconLeaf(p: IcoProps) {
  return (
    <Svg {...base(p)}>
      <Path d="M20 4S8 4 5.5 10.5 8 20 8 20s10-2 12-8V4z" {...stroke(p)} />
      <Path d="M8 20c0-5 3.5-9 9-11" {...stroke(p)} />
    </Svg>
  );
}

/** Quick. A bolt, for stock that is already a few streets away. */
export function IconZap(p: IcoProps) {
  return (
    <Svg {...base(p)}>
      <Path d="M13 2L4.5 13.5H11l-1 8.5 8.5-11.5H12l1-8.5z" {...stroke(p)} />
    </Svg>
  );
}

/** Orders. A document, because an order is a record rather than an object. */
export function IconDoc(p: IcoProps) {
  return (
    <Svg {...base(p)}>
      <Path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8l-5-5z" {...stroke(p)} />
      <Path d="M14 3v5h5M9 13h6M9 17h4" {...stroke(p)} />
    </Svg>
  );
}

export function IconUser(p: IcoProps) {
  return (
    <Svg {...base(p)}>
      <Circle cx="12" cy="8" r="3.6" {...stroke(p)} />
      <Path d="M4.5 20a7.5 7.5 0 0115 0" {...stroke(p)} />
    </Svg>
  );
}

export function IconHome(p: IcoProps) {
  return (
    <Svg {...base(p)}>
      <Path d="M4 10.5L12 4l8 6.5V19a1.5 1.5 0 01-1.5 1.5h-13A1.5 1.5 0 014 19v-8.5z" {...stroke(p)} />
    </Svg>
  );
}

export function IconBasket(p: IcoProps) {
  return (
    <Svg {...base(p)}>
      <Path d="M4 8h16l-1.4 11.2a2 2 0 01-2 1.8H7.4a2 2 0 01-2-1.8L4 8z" {...stroke(p)} />
      <Path d="M8.5 8l2-5M15.5 8l-2-5" {...stroke(p)} />
    </Svg>
  );
}
