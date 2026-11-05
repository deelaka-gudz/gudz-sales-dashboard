const REQUEST_TIMEOUT_MS = 20000;
const MAX_ATTEMPTS = 3;
const MAX_RETRY_WAIT_MS = 5000;
const MAX_RATE_LIMIT_ATTEMPTS = 5;
const MAX_RATE_LIMIT_WAIT_MS = 15000;
const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const backoff = (attempt) => 500 * 2 ** (attempt - 1);

const errorHint = (status) => {
  if (status === 401 || status === 403) return " - check the credentials";
  if (status === 404) return " - check the base URL";
  if (status === 429) return " - rate limited";
  return "";
};

const networkReason = (error) =>
  error.name === "TimeoutError"
    ? `timed out after ${REQUEST_TIMEOUT_MS / 1000}s`
    : error.cause?.code || error.message;

export async function requestJson(url, options, label) {
  for (let attempt = 1; ; attempt++) {
    const lastAttempt = attempt >= MAX_ATTEMPTS;
    let response;
    try {
      response = await fetch(url, {
        ...options,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      if (lastAttempt) {
        throw new Error(
          `${label} could not be reached (${networkReason(error)})`,
        );
      }
      await sleep(backoff(attempt));
      continue;
    }

    if (response.ok) {
      try {
        return await response.json();
      } catch {
        throw new Error(`${label} returned a response that was not valid JSON`);
      }
    }

    // Rate limits last far longer than other failures, so they get more
    // attempts and are waited out for as long as the server asks.
    const rateLimited = response.status === 429;
    if (
      RETRYABLE_STATUS.has(response.status) &&
      attempt < (rateLimited ? MAX_RATE_LIMIT_ATTEMPTS : MAX_ATTEMPTS)
    ) {
      const retryAfter = Number(response.headers.get("retry-after"));
      const cap = rateLimited ? MAX_RATE_LIMIT_WAIT_MS : MAX_RETRY_WAIT_MS;
      const fallback = rateLimited ? 3000 * attempt : backoff(attempt);
      const wait = retryAfter > 0 ? retryAfter * 1000 : fallback;
      await sleep(Math.min(wait, cap));
      continue;
    }

    const text = (await response.text().catch(() => "")).slice(0, 300);
    const error = new Error(
      `${label} failed (${response.status})${errorHint(response.status)}${text ? `: ${text}` : ""}`,
    );
    error.status = response.status;
    throw error;
  }
}
