import * as React from "react";
import { REQUEST_TIMEOUT_MS } from "../constants/dashboard";

const TIMEOUT = "timeout";

async function readSuppliers(response) {
  let body;
  try {
    body = await response.json();
  } catch {
    throw new Error(
      `The server returned an unexpected response (${response.status})`,
    );
  }
  if (!response.ok) throw new Error(body.error || response.statusText);
  if (!Array.isArray(body.sections)) {
    throw new Error("The server response was missing supplier data");
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

export function useSupplierSales(channelKey, query) {
  const [state, setState] = React.useState({ data: null, error: null });
  const [attempt, setAttempt] = React.useState(0);

  React.useEffect(() => {
    if (!channelKey || !query) return undefined;
    setState({ data: null, error: null });

    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(TIMEOUT),
      REQUEST_TIMEOUT_MS,
    );
    fetch(`/api/supplier-sales?channel=${channelKey}&${query}`, {
      signal: controller.signal,
    })
      .then(readSuppliers)
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
  }, [channelKey, query, attempt]);

  const retry = React.useCallback(() => setAttempt((n) => n + 1), []);
  const loading = Boolean(channelKey && query) && !state.data && !state.error;

  return { ...state, loading, retry };
}
