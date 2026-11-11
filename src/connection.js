export const CONNECTION_WAIT_MS = 8000;
export const REQUEST_TIMEOUT_MS = 15000;
export const AUTH_REQUEST_TIMEOUT_MS = 30000;

export class ConnectionTimeoutError extends Error {
  constructor() {
    super('연결 응답 시간이 초과되었습니다.');
    this.name = 'ConnectionTimeoutError';
  }
}

// Bound the caller's wait even when the SDK is waiting for session recovery.
export function withDeadline(operation, timeoutMs = REQUEST_TIMEOUT_MS) {
  let timer;
  return Promise.race([
    Promise.resolve(operation),
    new Promise((_, reject) => { timer = setTimeout(() => reject(new ConnectionTimeoutError()), timeoutMs); })
  ]).finally(() => clearTimeout(timer));
}

// Keep the SDK's session persistence and refresh behavior. Only bound network waits;
// never clear stored credentials or retry a request in this wrapper.
export function connectionFetch(fetchImpl, timeoutMs = REQUEST_TIMEOUT_MS) {
  return async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input.url || String(input);
    const method = (init.method || input.method || 'GET').toUpperCase();
    if (!['GET', 'HEAD', 'OPTIONS'].includes(method) && !new URL(url).pathname.startsWith('/auth/v1/')) return fetchImpl(input, init);
    const controller = new AbortController();
    const upstream = init.signal || input.signal;
    const abort = () => controller.abort(upstream.reason);
    if (upstream?.aborted) abort();
    else upstream?.addEventListener('abort', abort, {once: true});
    const limit=new URL(url).pathname.startsWith('/auth/v1/')&&timeoutMs===REQUEST_TIMEOUT_MS?AUTH_REQUEST_TIMEOUT_MS:timeoutMs;
    const timer = setTimeout(() => controller.abort(new ConnectionTimeoutError()), limit);
    try { return await fetchImpl(input, {...init, signal: controller.signal}); }
    finally { clearTimeout(timer); upstream?.removeEventListener('abort', abort); }
  };
}

// A slow session check must not keep the login form hidden. A later successful
// result can still open the board, while newer auth events invalidate stale results.
export function createSessionCheck(getSession, onState, {waitMs = CONNECTION_WAIT_MS, timers = {setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: id => clearTimeout(id)}} = {}) {
  let generation = 0, pending = null, timer;
  const clear = () => { timers.clearTimeout(timer); timer = undefined; };
  return {
    check() {
      if (pending) return pending;
      const request = ++generation;
      onState({status: 'checking'});
      timer = timers.setTimeout(() => { if (request === generation) onState({status: 'slow'}); }, waitMs);
      pending = Promise.resolve().then(getSession).then(({data, error}) => {
        if (request !== generation) return;
        if (error) throw error;
        onState(data?.session ? {status: 'session', session: data.session} : {status: 'guest'});
      }).catch(error => { if (request === generation) onState({status: 'error', error}); })
        .finally(() => { if (request === generation) { clear(); pending = null; } });
      return pending;
    },
    accept(session) {
      ++generation; clear(); pending = null;
      onState(session ? {status: 'session', session} : {status: 'guest'});
    }
  };
}
