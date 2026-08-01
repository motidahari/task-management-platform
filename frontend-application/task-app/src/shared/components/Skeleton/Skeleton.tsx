import type { CSSProperties, ReactElement } from 'react';

import { useTranslation } from '../../hooks/useTranslation';
import './Skeleton.scss';

export type SkeletonVariant = 'text' | 'block' | 'circle';

export interface SkeletonProps {
  readonly variant?: SkeletonVariant;
  /** Rendered box in px, or any CSS width value. */
  readonly width?: number | string;
  /** Rendered box in px, or any CSS height value. */
  readonly height?: number | string;
  readonly count?: number;
}

/**
 * Shimmering placeholder shown instead of a bare `Spinner` on initial list and
 * drawer loads. The shimmer is disabled under `prefers-reduced-motion`.
 */
export function Skeleton({
  variant = 'text',
  width,
  height,
  count = 1,
}: SkeletonProps): ReactElement {
  const { t } = useTranslation('skeleton');
  const style: CSSProperties = { width, height };

  return (
    <span className="skeleton-group" role="status" aria-live="polite">
      <span className="visually-hidden">{t('loading-label')}</span>
      {Array.from({ length: count }, (_, index) => (
        <span
          key={index}
          className={`skeleton skeleton--${variant}`}
          style={style}
          aria-hidden="true"
        />
      ))}
    </span>
  );
}
