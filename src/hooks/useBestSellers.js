import * as React from "react";
import { REQUEST_TIMEOUT_MS } from "../constants/dashboard";
import { CHUNK_DAYS, resolveDays } from "./useSales";

const TIMEOUT = "timeout";

async function readBestSellers(response, warming = false) {
  let body;
  try {
    body = await response.json();
  } catch {
    throw new Error(
      `The server returned an unexpected response (${response.status})`,
    );
  }
  if (!response.ok) throw new Error(body.error || response.statusText);
  if (!warming && !body.channels) {
    throw new Error("The server response was missing best seller data");
  }
  return body;
}

function describeError(error, signal) {
  if (signal.reason === TIMEOUT) return "The request took too long";
  if (error instanceof TypeError) {
    return "Could not reach the server - check your connection";
  }
  return error.message;
}

// A long range is worked out a few days at a time, one request after another,
// so each finishes within the host's time limit and its days are cached even
// if a later one fails. The full request afterwards then finds almost
// everything cached.
async function warmUp(query, signal, arm) {
  const days = resolveDays(query);
  if (!days) return;
  for (let i = 0; i < days.length; i += CHUNK_DAYS) {
    arm();
    const chunk = days.slice(i, i + CHUNK_DAYS);
    const url = `/api/best-sellers?from=${chunk[0]}&to=${chunk[chunk.length - 1]}&warm=1`;
    await readBestSellers(await fetch(url, { signal }), true);
  }
}

// Best sellers read every order line, so they load separately from the sales
// figures and the page doesn't wait for them.
export function useBestSellers(query) {
  const [state, setState] = React.useState({ data: null, error: null });

  React.useEffect(() => {
    if (!query) return undefined;
    setState({ data: null, error: null });

    const controller = new AbortController();
    // The time limit applies to each request, not to the whole chunked load.
    let timeout;
    const arm = () => {
      clearTimeout(timeout);
      timeout = setTimeout(() => controller.abort(TIMEOUT), REQUEST_TIMEOUT_MS);
    };
    arm();
    warmUp(query, controller.signal, arm)
      .then(() => {
        arm();
        return fetch(`/api/best-sellers?${query}`, {
          signal: controller.signal,
        });
      })
      .then(readBestSellers)
      .then((data) => setState({ data, error: null }))
      .catch((err) => {
        const superseded =
          controller.signal.aborted && controller.signal.reason !== TIMEOUT;
        if (!superseded) {
          setState({
            data: null,
            error: describeError(err, controller.signal),
          });
        }
      })
      .finally(() => clearTimeout(timeout));

    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [query]);

  return { ...state, loading: Boolean(query) && !state.data && !state.error };
}
