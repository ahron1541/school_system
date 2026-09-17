let csrfToken = '';
export const setCsrfToken = (value) => { csrfToken = value || ''; };

export async function api(path, { method = 'GET', body, signal } = {}) {
  let response;
  const binary = body instanceof Blob;
  try {
    response = await fetch('/api' + path, { method, credentials: 'same-origin', signal: signal || AbortSignal.timeout(8000), headers: { Accept: 'application/json', ...(body !== undefined ? { 'Content-Type': binary ? body.type : 'application/json' } : {}), ...(!['GET','HEAD'].includes(method) ? { 'X-CSRF-Token': csrfToken } : {}) }, body: body === undefined ? undefined : binary ? body : JSON.stringify(body) });
  } catch { throw new Error('Cannot reach the local server. Check that the backend is running.'); }
  let result;
  try { result = await response.json(); } catch { throw new Error('The server returned an invalid response.'); }
  if (!response.ok || !result.success) {
    const error = new Error(result.message || 'Request failed.');
    error.status = response.status;
    error.code = result.error?.code;
    if (response.status === 401 && path !== '/auth/login' && csrfToken) window.dispatchEvent(new Event('session-expired'));
    throw error;
  }
  return result.data;
}
