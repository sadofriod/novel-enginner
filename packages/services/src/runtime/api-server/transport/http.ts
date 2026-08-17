export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

export function redirectResponse(location: string): Response {
  return new Response(null, { status: 303, headers: { location } });
}

export function readFormValue(form: FormData, key: string): string | undefined {
  const value = form.get(key);
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

export function readSyncBody(request: Request): Promise<Record<string, unknown>> {
  return request.json().then((parsed) => {
    if (parsed !== null && typeof parsed === 'object') {
      return parsed as Record<string, unknown>;
    }
    return {};
  }).catch(() => ({}));
}

export function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' ? value as Record<string, unknown> : {};
}
