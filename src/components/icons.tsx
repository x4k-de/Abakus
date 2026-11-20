// Schlichte Linien-Icons (1,6 px Strich), passend zur ruhigen Gestaltung.
import type { ReactNode } from 'react';

const Svg = ({ children }: { children: ReactNode }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
);

export const IconDepot = () => (
  <Svg>
    <path d="M4 19V10M10 19V5M16 19v-7M22 19H2" />
  </Svg>
);
export const IconCrypto = () => (
  <Svg>
    <path d="M12 3l7.5 4.5v9L12 21l-7.5-4.5v-9z" />
    <path d="M12 8v8M9 10.5l3-2.5 3 2.5" />
  </Svg>
);
export const IconList = () => (
  <Svg>
    <path d="M8 6h12M8 12h12M8 18h12" />
    <circle cx="4" cy="6" r=".6" fill="currentColor" />
    <circle cx="4" cy="12" r=".6" fill="currentColor" />
    <circle cx="4" cy="18" r=".6" fill="currentColor" />
  </Svg>
);
export const IconImport = () => (
  <Svg>
    <path d="M12 4v11M7.5 10.5L12 15l4.5-4.5" />
    <path d="M4 17v2a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-2" />
  </Svg>
);
export const IconMore = () => (
  <Svg>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 2.5v2.2M12 19.3v2.2M4.6 4.6l1.6 1.6M17.8 17.8l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.6 19.4l1.6-1.6M17.8 6.2l1.6-1.6" />
  </Svg>
);
export const IconRefresh = () => (
  <Svg>
    <path d="M20 11a8 8 0 1 0-2.3 5.7" />
    <path d="M20 4v7h-7" />
  </Svg>
);
export const IconChevron = () => (
  <Svg>
    <path d="M9 6l6 6-6 6" />
  </Svg>
);
