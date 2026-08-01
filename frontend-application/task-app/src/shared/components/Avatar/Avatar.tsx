import type { CSSProperties, ReactElement } from 'react';

import avatarMarkup from '../../../assets/avatar.svg?raw';
import { useTranslation } from '../../hooks/useTranslation';
import './Avatar.scss';

/** Background palette; the avatar shape stays white, only this changes per user. */
export const AVATAR_COLORS = [
  '#FFB3BA',
  '#FFDFBA',
  '#FFFFBA',
  '#BAFFC9',
  '#BAE1FF',
  '#D5AAFF',
  '#FFB3F7',
  '#B3FFF4',
  '#FFE4B5',
  '#E6E6FA',
  '#F08080',
  '#20B2AA',
  '#778899',
  '#9370DB',
  '#3CB371',
] as const;

export interface AvatarProps {
  /** Stable value (user id or name) → same color every render. */
  readonly seed?: string;
  /** Explicit background; wins over `seed`. */
  readonly color?: string;
  /** Rendered box in px. */
  readonly size?: number;
  readonly alt?: string;
}

/** Maps any seed to a stable palette entry so a user keeps one color across sessions. */
function colorForSeed(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length] ?? AVATAR_COLORS[0];
}

/**
 * Single reusable avatar. The SVG uses `currentColor`, so the background is driven
 * by the CSS `color` set here — no per-user file, one shape colored many ways.
 */
export function Avatar({ seed, color, size = 40, alt }: AvatarProps): ReactElement {
  const { t } = useTranslation('avatar');
  const background = color ?? (seed ? colorForSeed(seed) : AVATAR_COLORS[0]);
  const style: CSSProperties = { color: background, width: size, height: size };

  return (
    <span
      className="avatar"
      role="img"
      aria-label={alt ?? t('default-alt-label')}
      style={style}
      // Safe: static markup bundled at build time, never interpolates external/user data.
      dangerouslySetInnerHTML={{ __html: avatarMarkup }}
    />
  );
}
