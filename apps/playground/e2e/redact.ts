const SECRET_QUERY = /(access_token|token|key|signature)=([^&\s]+)/gi;
const JWT = /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g;

/** Removes query credentials and JWT-shaped values from evidence URLs/text. */
export function redactUrl(raw: string): string {
  try {
    const url = new URL(raw);
    for (const key of ['access_token', 'token', 'key', 'signature']) {
      if (url.searchParams.has(key)) {
        url.searchParams.set(key, '[redacted]');
      }
    }
    return url.toString();
  } catch {
    return redactText(raw);
  }
}

export function redactText(text: string): string {
  return text.replace(SECRET_QUERY, '$1=[redacted]').replace(JWT, '[redacted-jwt]');
}

export function isAbortedRequest(errorText: string | undefined): boolean {
  return errorText?.includes('ERR_ABORTED') ?? false;
}
