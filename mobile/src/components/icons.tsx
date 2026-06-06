// Stroke icons — react-native-svg port of the <Ico> set in crop-bid mobile-ui.jsx.
import React from 'react';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

export type IcoProps = {
  d?: string;
  size?: number;
  sw?: number;
  fill?: string;
  stroke?: string;
  vb?: number;
  children?: React.ReactNode;
};

// Generic icon frame. Pass a `d` path or compose <Path>/<Circle>/<Rect> children.
export function Ico({ d, size = 22, sw = 1.8, fill = 'none', stroke = 'currentColor', vb = 24, children }: IcoProps) {
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${vb} ${vb}`} fill={fill} stroke={stroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
      {d ? <Path d={d} /> : children}
    </Svg>
  );
}

export const IconHome = (p: IcoProps) => <Ico {...p} d="M3 11l9-7 9 7M5 9.5V20h5v-6h4v6h5V9.5" />;

export const IconMarket = (p: IcoProps) => (
  <Ico {...p}>
    <Path d="M3 17l5-6 4 4 5-7 4 5" />
    <Circle cx={3} cy={17} r={0.6} />
  </Ico>
);

export const IconAgent = (p: IcoProps) => (
  <Ico {...p}>
    <Rect x={4} y={8} width={16} height={11} rx={3} />
    <Path d="M9 8V6a3 3 0 0 1 6 0v2" />
    <Circle cx={9.5} cy={13.5} r={0.9} fill="currentColor" stroke="none" />
    <Circle cx={14.5} cy={13.5} r={0.9} fill="currentColor" stroke="none" />
  </Ico>
);

export const IconDoc = (p: IcoProps) => (
  <Ico {...p}>
    <Path d="M7 3h7l4 4v14H7z" />
    <Path d="M14 3v4h4M10 13h5M10 16.5h5" />
  </Ico>
);

export const IconUser = (p: IcoProps) => (
  <Ico {...p}>
    <Circle cx={12} cy={8} r={3.4} />
    <Path d="M5.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6" />
  </Ico>
);

export const IconArrow = (p: IcoProps) => <Ico {...p} vb={14} size={p.size || 14} d="M3 7h8M7 3l4 4-4 4" />;

export const IconBolt = (p: IcoProps) => <Ico {...p} fill="currentColor" stroke="none" d="M13 2L4 14h6l-1 8 9-12h-6z" />;

export const IconBell = (p: IcoProps) => (
  <Ico {...p}>
    <Path d="M18 8a6 6 0 1 0-12 0c0 7-2 9-2 9h16s-2-2-2-9" />
    <Path d="M10.5 21a2 2 0 0 0 3 0" />
  </Ico>
);

export const IconChevR = (p: IcoProps) => <Ico {...p} vb={14} size={p.size || 13} sw={2.2} d="M5 2l5 5-5 5" />;

export const IconSearch = (p: IcoProps) => (
  <Ico {...p}>
    <Circle cx={11} cy={11} r={7} />
    <Path d="M16 16l4 4" />
  </Ico>
);

export const IconCheck = (p: IcoProps) => <Ico {...p} d="M4 12l5 5L20 6" />;

export const IconShield = (p: IcoProps) => (
  <Ico {...p}>
    <Path d="M12 3l7 3v5c0 4-3 7-7 8-4-1-7-4-7-8V6z" />
    <Path d="M9 11l2 2 4-4" />
  </Ico>
);
