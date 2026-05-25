export function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function getStatus(error) {
  return error?.response?.status || error?.code || error?.errors?.[0]?.reason;
}

export function isRetryable(error) {
  const status = getStatus(error);
  const reason = error?.errors?.[0]?.reason || error?.response?.data?.error?.errors?.[0]?.reason;

  if ([408, 409, 425, 429, 500, 502, 503, 504].includes(Number(status))) return true;
  return [
    'rateLimitExceeded',
    'userRateLimitExceeded',
    'backendError',
    'internalError',
    'quotaExceeded',
    'ECONNRESET',
    'ETIMEDOUT',
    'EAI_AGAIN'
  ].includes(reason || status);
}

export async function retry(fn, options = {}) {
  const retries = options.retries ?? 4;
  const baseDelayMs = options.baseDelayMs ?? 750;
  const factor = options.factor ?? 2;
  const logger = options.logger;
  let attempt = 0;

  for (;;) {
    try {
      return await fn(attempt);
    } catch (error) {
      attempt += 1;
      if (attempt > retries || !isRetryable(error)) throw error;

      const jitter = Math.floor(Math.random() * 250);
      const delay = Math.floor(baseDelayMs * factor ** (attempt - 1)) + jitter;
      logger?.warn?.(`Retrying after transient failure (${attempt}/${retries}): ${error.message}`);
      await sleep(delay);
    }
  }
}
