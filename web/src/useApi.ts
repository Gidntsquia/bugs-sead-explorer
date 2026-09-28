import { useEffect, useState } from "react";
import { api, ApiError } from "./api";

export function useApi<T = any>(path: string | null) {
  const [state, setState] = useState<{ data: T | null; error: ApiError | null; loading: boolean }>({ data: null, error: null, loading: !!path });
  useEffect(() => {
    if (!path) { setState({ data: null, error: null, loading: false }); return; }
    const ctl = new AbortController();
    setState(s => ({ data: s.data, error: null, loading: true }));
    api<T>(path, ctl.signal)
      .then(data => setState({ data, error: null, loading: false }))
      .catch(e => { if (e?.name !== "AbortError") setState({ data: null, error: e, loading: false }); });
    return () => ctl.abort();
  }, [path]);
  return state;
}
