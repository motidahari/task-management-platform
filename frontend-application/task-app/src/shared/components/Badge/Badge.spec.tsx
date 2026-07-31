import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Badge } from './Badge';

describe('Badge, Given:no variant prop', () => {
  it('should render its text with the neutral variant class', () => {
    render(<Badge>Open</Badge>);

    expect(screen.getByText('Open')).toHaveClass('badge--neutral');
  });
});

describe('Badge, Given:a variant prop', () => {
  it('should apply the matching variant class', () => {
    render(<Badge variant="danger">Closed</Badge>);

    expect(screen.getByText('Closed')).toHaveClass('badge--danger');
  });
});
