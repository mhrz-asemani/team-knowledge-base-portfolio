const webBaseUrl = normalizeBaseUrl(
  process.env.WEB_BASE_URL ?? 'http://127.0.0.1:8080',
);
const apiBaseUrl = normalizeBaseUrl(
  process.env.API_BASE_URL ?? new URL('/api/v1', webBaseUrl).toString(),
);

async function checkStatus(label, url, expectedStatus) {
  const response = await fetch(url, { redirect: 'manual' });
  if (response.status !== expectedStatus) {
    throw new Error(`${label}: expected HTTP ${expectedStatus}, received ${response.status} (${url})`);
  }
  console.log(`PASS ${label} (HTTP ${response.status})`);
  return response;
}

function normalizeBaseUrl(value) {
  return value.replace(/\/+$/, '');
}

try {
  const webResponse = await checkStatus('web application', webBaseUrl, 200);
  const html = await webResponse.text();
  if (!html.toLowerCase().includes('team knowledge base')) {
    throw new Error('web application: response does not look like the Team Knowledge Base UI');
  }

  await checkStatus('API liveness', `${apiBaseUrl}/health`, 200);
  await checkStatus('API readiness', `${apiBaseUrl}/health/ready`, 200);

  const openApiResponse = await checkStatus(
    'OpenAPI document',
    `${apiBaseUrl}/openapi.json`,
    200,
  );
  const openApi = await openApiResponse.json();
  if (!openApi.paths || !Object.keys(openApi.paths).some((path) => path.includes('/auth/register'))) {
    throw new Error('OpenAPI document: expected authentication endpoints were not found');
  }
  console.log('PASS OpenAPI contains authentication routes');

  await checkStatus('unauthenticated session protection', `${apiBaseUrl}/auth/me`, 401);
  console.log('Smoke checks passed. No application data was created or modified.');
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Smoke test failed');
  process.exitCode = 1;
}
