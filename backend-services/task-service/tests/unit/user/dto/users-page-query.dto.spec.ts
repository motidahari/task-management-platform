import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { UsersPageQueryDto } from '../../../../src/user/dto/users-page-query.dto';

describe('UsersPageQueryDto', () => {
  describe('Given:no query params at all, When:transforming and validating', () => {
    it('should leave every field undefined and pass validation', async () => {
      const dto = plainToInstance(UsersPageQueryDto, {});

      expect(dto.limit).toBeUndefined();
      expect(dto.cursor).toBeUndefined();
      expect(await validate(dto)).toHaveLength(0);
    });
  });

  describe('Given:a numeric-looking limit query string, When:transforming', () => {
    it('should coerce it to a number', async () => {
      const dto = plainToInstance(UsersPageQueryDto, { limit: '5' });

      expect(dto.limit).toBe(5);
      expect(await validate(dto)).toHaveLength(0);
    });
  });

  describe('Given:a limit below 1, When:validating', () => {
    it('should reject it', async () => {
      const dto = plainToInstance(UsersPageQueryDto, { limit: '0' });

      const errors = await validate(dto);

      expect(errors).toHaveLength(1);
      expect(errors[0]?.property).toBe('limit');
    });
  });

  describe('Given:a cursor string, When:transforming', () => {
    it('should pass it through untouched', async () => {
      const dto = plainToInstance(UsersPageQueryDto, { cursor: 'opaque-cursor' });

      expect(dto.cursor).toBe('opaque-cursor');
      expect(await validate(dto)).toHaveLength(0);
    });
  });
});
