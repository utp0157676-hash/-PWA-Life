/* Same-origin PHP API; never cached by the service worker. */
const LifeAPI = (() => {
  const base = new URL('./api/', document.baseURI);
  async function request(path, method = 'GET', data, token) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(new URL(path, base), {
        method, cache: 'no-store', credentials: 'same-origin', signal: controller.signal,
        headers: { Accept: 'application/json', ...(data ? {
          'Content-Type': 'application/json', 'X-PWA-Request': '1', 'Idempotency-Key': token
        } : {}) },
        ...(data ? { body: JSON.stringify(data) } : {})
      });
      if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('La API PHP no está disponible.');
      const body = await response.json();
      if (!response.ok) {
        const error = new Error(body.error?.message || 'Error de API.');
        error.status = response.status;
        throw error;
      }
      if (!Object.hasOwn(body, 'data')) throw new Error('Respuesta API inválida.');
      return body.data;
    } finally { clearTimeout(timeout); }
  }
  return { request };
})();
