/** Host headers can already contain content-type; set it once case-insensitively for JSON requests. */
export function jsonRequestHeaders(hostHeaders: HeadersInit = {}): Headers {
  const headers = new Headers(hostHeaders);
  headers.set('Content-Type', 'application/json');
  return headers;
}
