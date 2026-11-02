import * as React from "react";
import { REQUEST_TIMEOUT_MS } from "../constants/dashboard";

const TIMEOUT = "timeout";

async function readBestSellers(response) {
  let body;
  try {
    body = await response.json();
  } catch {
    throw new Error(
      `The server returned an unexpected response (${response.status})`,
    );
  }
  if (!response.ok) throw new Error(body.error || response.statusText);
  if (!body.channels) {
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

// Best sellers read every order line, so they load separately from the sales
// figures and the page doesn't wait for them.
export function useBestSellers(query) {
  const [state, setState] = React.useState({ data: null, error: null });

  React.useEffect(() => {
    if (!query) return undefined;
    setState({ data: null, error: null });

    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(TIMEOUT),
      REQUEST_TIMEOUT_MS,
    );
    fetch(`/api/best-sellers?${query}`, { signal: controller.signal })
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
