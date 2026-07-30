const BASE_URL = process.env.NOTIFICATION_SMOKE_TEST_URL || 'http://localhost:4000';

test('GET /health returns 200 (notification service is up)', async () => {
  const res = await fetch(`${BASE_URL}/health`);
  expect(res.status).toBe(200);
});

test('POST /notify/confirmation with missing fields returns 400', async () => {
  const res = await fetch(`${BASE_URL}/notify/confirmation`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ to: 'test@example.com' }),
  });
  expect(res.status).toBe(400);
});

test('POST /notify/reminder with missing fields returns 400', async () => {
  const res = await fetch(`${BASE_URL}/notify/reminder`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  expect(res.status).toBe(400);
});
