import type { ReactElement } from 'react';

import './Icon.scss';

export type IconName =
  | 'package'
  | 'wrench'
  | 'task'
  | 'chevron-down'
  | 'chevron-right'
  | 'close'
  | 'clock'
  | 'check'
  | 'plus'
  | 'user'
  | 'inbox'
  | 'alert';

export interface IconProps {
  readonly name: IconName;
  /** Rendered box in px. */
  readonly size?: number;
  /** Accessible name; omitted renders the svg `aria-hidden` for decorative use. */
  readonly title?: string;
}

const ICON_PATHS: Record<IconName, ReactElement> = {
  package: (
    <>
      <path d="M12 3 4 7v10l8 4 8-4V7l-8-4Z" />
      <path d="M4 7l8 4 8-4" />
      <path d="M12 11v10" />
    </>
  ),
  wrench: (
    <path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4 2.6-2.6Z" />
  ),
  task: (
    <>
      <rect x="5" y="3" width="14" height="18" rx="2" />
      <path d="M9 3h6v2H9z" />
      <path d="M8 11h8M8 15h5" />
    </>
  ),
  'chevron-down': <path d="M6 9l6 6 6-6" />,
  'chevron-right': <path d="M9 6l6 6-6 6" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 3" />
    </>
  ),
  check: <path d="M5 13l4 4L19 7" />,
  plus: <path d="M12 5v14M5 12h14" />,
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4 3.6-7 8-7s8 3 8 7" />
    </>
  ),
  inbox: (
    <>
      <path d="M4 12h4l2 3h4l2-3h4" />
      <path d="M4 12 5.5 5A2 2 0 0 1 7.4 3.5h9.2A2 2 0 0 1 18.5 5L20 12v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-6Z" />
    </>
  ),
  alert: (
    <>
      <path d="M12 3 2 21h20L12 3Z" />
      <path d="M12 10v4" />
      <path d="M12 17h.01" />
    </>
  ),
};

/** One inline stroke-icon set keyed by `IconName`; colour is inherited via `currentColor`. */
export function Icon({ name, size = 16, title }: IconProps): ReactElement {
  return (
    <svg
      className="icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
    >
      {title ? <title>{title}</title> : null}
      {ICON_PATHS[name]}
    </svg>
  );
}
