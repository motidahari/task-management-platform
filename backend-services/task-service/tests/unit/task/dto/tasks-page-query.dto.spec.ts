import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { TasksPageQueryDto } from '../../../../src/task/dto/tasks-page-query.dto';

describe('TasksPageQueryDto', () => {
  describe('Given:no query params at all, When:transforming and validating', () => {
    it('should leave every field undefined and pass validation', async () => {
      const dto = plainToInstance(TasksPageQueryDto, {});

      expect(dto.isClosed).toBeUndefined();
      expect(dto.limit).toBeUndefined();
      expect(dto.cursor).toBeUndefined();
      expect(await validate(dto)).toHaveLength(0);
    });
  });

  describe('Given:isClosed=false as a query string, When:transforming', () => {
    it('should become the boolean false rather than a truthy non-empty string', async () => {
      const dto = plainToInstance(TasksPageQueryDto, { isClosed: 'false' });

      expect(dto.isClosed).toBe(false);
      expect(await validate(dto)).toHaveLength(0);
    });
  });

  describe('Given:isClosed=true as a query string, When:transforming', () => {
    it('should become the boolean true', async () => {
      const dto = plainToInstance(TasksPageQueryDto, { isClosed: 'true' });

      expect(dto.isClosed).toBe(true);
      expect(await validate(dto)).toHaveLength(0);
    });
  });

  describe('Given:an isClosed value that is neither "true" nor "false", When:validating', () => {
    it('should reject it', async () => {
      const dto = plainToInstance(TasksPageQueryDto, { isClosed: 'maybe' });

      const errors = await validate(dto);

      expect(errors).toHaveLength(1);
      expect(errors[0]?.property).toBe('isClosed');
    });
  });

  describe('Given:a numeric-looking limit query string, When:transforming', () => {
    it('should coerce it to a number', async () => {
      const dto = plainToInstance(TasksPageQueryDto, { limit: '5' });

      expect(dto.limit).toBe(5);
      expect(await validate(dto)).toHaveLength(0);
    });
  });

  describe('Given:a limit below 1, When:validating', () => {
    it('should reject it', async () => {
      const dto = plainToInstance(TasksPageQueryDto, { limit: '0' });

      const errors = await validate(dto);

      expect(errors).toHaveLength(1);
      expect(errors[0]?.property).toBe('limit');
    });
  });

  describe('Given:a cursor string, When:transforming', () => {
    it('should pass it through untouched', async () => {
      const dto = plainToInstance(TasksPageQueryDto, { cursor: 'opaque-cursor' });

      expect(dto.cursor).toBe('opaque-cursor');
      expect(await validate(dto)).toHaveLength(0);
    });
  });
});
