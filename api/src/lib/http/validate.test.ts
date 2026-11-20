import { Router } from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { buildRouterTestApp } from '../../test-utils/app.js';
import { validate } from './validate.js';

const router = Router();
router.post(
  '/items/:id',
  validate({
    params: z.object({ id: z.uuid() }).strict(),
    body: z.object({ title: z.string().min(1).max(10) }).strict(),
  }),
  (_req, res) => {
    res.json(res.locals.validated);
  },
);
const app = buildRouterTestApp(router);

const ID = '3f0e8a3c-6f1b-4c1e-9a43-2a0b8f0d1c11';

describe('validate()', () => {
  it('passes parsed values through res.locals.validated', async () => {
    const res = await request(app).post(`/items/${ID}`).send({ title: 'Buy milk' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ params: { id: ID }, body: { title: 'Buy milk' } });
  });

  it('returns 400 validation_error with field details', async () => {
    const res = await request(app).post('/items/not-a-uuid').send({ title: '', extra: true });

    expect(res.status).toBe(400);
    const body = res.body as { error: { code: string; details: { path: string }[] } };
    expect(body.error.code).toBe('validation_error');
    const paths = body.error.details.map((d) => d.path);
    expect(paths).toContain('params.id');
    expect(paths).toContain('body.title');
  });
});
