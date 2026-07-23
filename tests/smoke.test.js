const BASE_URL = process.env.SMOKE_TEST_URL || 'http://localhost:3000';

test('GET / returns 200 (public landing page)', async () => {
  const res = await fetch(`${BASE_URL}/`);
  expect(res.status).toBe(200);
});

test('GET /login returns 200 (public login page)', async () => {
  const res = await fetch(`${BASE_URL}/login`);
  expect(res.status).toBe(200);
});

test('GET /appointments redirects unauthenticated users to /login', async () => {
  const res = await fetch(`${BASE_URL}/appointments`, { redirect: 'manual' });
  expect(res.status).toBe(302);
});
