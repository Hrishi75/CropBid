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

// Shopping basket — the consumer Cart tab. Tapered body so it reads as a
// basket rather than a bucket at 23px.
export const IconBasket = (p: IcoProps) => (
  <Ico {...p}>
    <Path d="M3 9h18l-1.6 10.2a2 2 0 0 1-2 1.8H6.6a2 2 0 0 1-2-1.8L3 9z" />
    <Path d="M8.5 9L11 3M15.5 9L13 3" />
    <Path d="M9.5 13v4M14.5 13v4" />
  </Ico>
);

export const IconCheck = (p: IcoProps) => <Ico {...p} d="M4 12l5 5L20 6" />;

export const IconShield = (p: IcoProps) => (
  <Ico {...p}>
    <Path d="M12 3l7 3v5c0 4-3 7-7 8-4-1-7-4-7-8V6z" />
    <Path d="M9 11l2 2 4-4" />
  </Ico>
);

// A wallet: the card body, plus the pocket and stud on its right edge.
export const IconWallet = (p: IcoProps) => (
  <Ico {...p}>
    <Path d="M3 7.5A2.5 2.5 0 015.5 5H17a2 2 0 012 2v1" />
    <Path d="M3 7.5V17a2 2 0 002 2h14a2 2 0 002-2v-2.5" />
    <Path d="M21 8.5v6h-4.5a3 3 0 010-6H21z" />
  </Ico>
);

export const IconClock = (p: IcoProps) => (
  <Ico {...p}>
    <Circle cx={12} cy={12} r={8.5} />
    <Path d="M12 7.5V12l3 2" />
  </Ico>
);

// A sprout in a hand: the Partner tab. Growing and trading, rather than the
// briefcase every marketplace reaches for.
export const IconSprout = (p: IcoProps) => (
  <Ico {...p}>
    <Path d="M12 20v-7" />
    <Path d="M12 13c0-3 2-5 5-5 0 3-2 5-5 5z" />
    <Path d="M12 13c0-2.5-1.8-4.5-4.5-4.5 0 2.7 2 4.5 4.5 4.5z" />
    <Path d="M5 20h14" />
  </Ico>
);

export const IconLeaf = (p: IcoProps) => (
  <Ico {...p}>
    <Path d="M4 20c0-8 5-13 16-13 0 9-5 13-13 13H4z" />
    <Path d="M9 15c2-3 5-5 8-6" />
  </Ico>
);

export const IconArrowLeft = (p: IcoProps) => <Ico {...p} d="M19 12H5M11 6l-6 6 6 6" />;

export const IconPlus = (p: IcoProps) => <Ico {...p} sw={2.4} d="M12 5v14M5 12h14" />;

export const IconClose = (p: IcoProps) => <Ico {...p} sw={2.2} d="M6 6l12 12M18 6L6 18" />;

export const IconBell2 = (p: IcoProps) => (
  <Ico {...p}>
    <Path d="M18 8a6 6 0 10-12 0c0 6-2 7-2 7h16s-2-1-2-7" />
    <Path d="M10.3 21a2 2 0 003.4 0" />
  </Ico>
);
