import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { validateBody } from '../../middleware/validate.js';

describe('Zod Validation Middleware Suite', () => {
  const testSchema = z.object({
    name: z.string().min(2, 'Name too short'),
    age: z.number().min(18, 'Must be at least 18')
  });

  it('passes valid request body to next middleware', () => {
    const middleware = validateBody(testSchema);
    const req = {
      body: { name: 'Gábor', age: 30 }
    };
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn()
    };
    const next = vi.fn();

    middleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
    expect(req.body).toEqual({ name: 'Gábor', age: 30 });
  });

  it('rejects invalid request body with 400 status and formatted error details', () => {
    const middleware = validateBody(testSchema);
    const req = {
      body: { name: 'G', age: 15 },
      method: 'POST',
      originalUrl: '/test'
    };
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn()
    };
    const next = vi.fn();

    middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      error: 'VALIDATION_ERROR',
      details: expect.arrayContaining([
        expect.objectContaining({ field: 'name' }),
        expect.objectContaining({ field: 'age' })
      ])
    }));
  });
});
