export class ApiError extends Error {
  constructor(message: string, public status: number, public seadUnreachable = false) { super(message); }
}

export async function api<T = any>(path: string, signal?: AbortSignal): Promise<T> {
  let res: Response;
  try { res = await fetch(`/api/${path}`, { signal }); }
  catch (e: any) {
    if (e?.name === "AbortError") throw e;
    throw new ApiError("The explorer's own server isn't answering. Is it still running in the terminal?", 0);
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(body.error ?? `Request failed (${res.status})`, res.status, !!body.seadUnreachable);
  return body as T;
}
