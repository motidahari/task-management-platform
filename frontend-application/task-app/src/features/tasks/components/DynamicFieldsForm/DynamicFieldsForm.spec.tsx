import { fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';

import type { NumberFieldDescriptor, StringFieldDescriptor } from '../../types';
import { DynamicFieldsForm, getMissingRequiredFieldKeys } from './DynamicFieldsForm';

vi.mock('../../../../shared/hooks/useTranslation', () => ({
  useTranslation: (scope: string) => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${scope}.${key}:${JSON.stringify(params)}` : `${scope}.${key}`,
  }),
}));

describe('DynamicFieldsForm', () => {
  const titleDescriptor: StringFieldDescriptor = {
    key: 'title',
    label: 'Title',
    fieldType: 'string',
    maxLength: 10,
    pattern: '^[A-Za-z ]+$',
  };

  const estimateDescriptor: NumberFieldDescriptor = {
    key: 'estimate',
    label: 'Estimate',
    fieldType: 'number',
    min: 1,
    max: 5,
  };

  let onChange: Mock<(key: string, value: string) => void>;

  const renderForm = (
    props: Partial<ComponentProps<typeof DynamicFieldsForm>> = {},
  ): ReturnType<typeof render> =>
    render(
      <DynamicFieldsForm
        descriptors={[titleDescriptor, estimateDescriptor]}
        values={{}}
        onChange={onChange}
        {...props}
      />,
    );

  beforeEach(() => {
    vi.clearAllMocks();
    onChange = vi.fn();
  });

  describe('Given:a list of field descriptors', () => {
    it('should render a text input for a string descriptor honoring its maxLength', () => {
      renderForm();

      const titleInput = screen.getByLabelText('Title');

      expect(titleInput).toHaveAttribute('type', 'text');
      expect(titleInput).toHaveAttribute('maxlength', '10');
    });

    it('should render a numeric input for a number descriptor', () => {
      renderForm();

      expect(screen.getByLabelText('Estimate')).toHaveAttribute('type', 'number');
    });
  });

  describe('Given:the user edits a field', () => {
    it('should emit the descriptor key and the new value upward', () => {
      renderForm();

      fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'New title' } });

      expect(onChange).toHaveBeenCalledWith('title', 'New title');
    });
  });

  describe('Given:a number value below its descriptor minimum', () => {
    it('should render a range error for that field only', () => {
      renderForm({ values: { estimate: '0' } });

      expect(screen.getByLabelText('Estimate')).toHaveAttribute('aria-invalid', 'true');
      expect(screen.queryByLabelText('Title')).toHaveAttribute('aria-invalid', 'false');
    });
  });

  describe('Given:a number value above its descriptor maximum', () => {
    it('should render a range error for that field', () => {
      renderForm({ values: { estimate: '9' } });

      expect(screen.getByLabelText('Estimate')).toHaveAttribute('aria-invalid', 'true');
    });
  });

  describe('Given:a number value within its descriptor min and max', () => {
    it('should render no error for that field', () => {
      renderForm({ values: { estimate: '3' } });

      expect(screen.getByLabelText('Estimate')).toHaveAttribute('aria-invalid', 'false');
    });
  });

  describe('Given:a missingFields prop naming a descriptor key', () => {
    it('should highlight only that field as required', () => {
      renderForm({ values: { estimate: '3' }, missingFields: ['title'] });

      expect(screen.getByLabelText('Title')).toHaveAttribute('aria-invalid', 'true');
      expect(screen.getByLabelText('Estimate')).toHaveAttribute('aria-invalid', 'false');
    });
  });

  describe('getMissingRequiredFieldKeys', () => {
    describe('Given:values with an empty and a whitespace-only entry', () => {
      it('should return the keys of every empty descriptor', () => {
        const missing = getMissingRequiredFieldKeys([titleDescriptor, estimateDescriptor], {
          title: '',
          estimate: '   ',
        });

        expect(missing).toEqual(['title', 'estimate']);
      });
    });

    describe('Given:values with every descriptor filled', () => {
      it('should return no keys', () => {
        const missing = getMissingRequiredFieldKeys([titleDescriptor, estimateDescriptor], {
          title: 'A title',
          estimate: '3',
        });

        expect(missing).toEqual([]);
      });
    });
  });
});
