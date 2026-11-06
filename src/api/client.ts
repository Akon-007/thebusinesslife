/**
 * Thin HTTP client for the BUSINESSLIFE API.
 *
 * Everything that matters — accounts, verification state, business profile,
 * classroom data — is read from the server. The only thing kept in local
 * storage is the session token itself.
 */

const TOKEN_KEY = 'businesslife.session'

export function getToken(): string | null {
  try {
    return window.localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function setToken(token: string | null): void {
  try {
    if (token) window.localStorage.setItem(TOKEN_KEY, token)
    else window.localStorage.removeItem(TOKEN_KEY)
  } catch {
    /* storage unavailable — the session simply will not persist */
  }
}

export class ApiError extends Error {
  status: number
  details?: unknown

  constructor(status: number, message: string, details?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.details = details
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'
  body?: unknown
  /** Skip the Authorization header (used by the auth endpoints themselves). */
  anonymous?: boolean
}

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, anonymous = false } = options

  const headers: Record<string, string> = {}
  if (body !== undefined) headers['Content-Type'] = 'application/json'

  if (!anonymous) {
    const token = getToken()
    if (token) headers.Authorization = `Bearer ${token}`
  }

  let response: Response
  try {
    response = await fetch(`/api${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new ApiError(0, 'Could not reach the server. Is it running?')
  }

  const text = await response.text()
  let payload: unknown = null
  if (text) {
    try {
      payload = JSON.parse(text)
    } catch {
      payload = text
    }
  }

  if (!response.ok) {
    const record = (payload ?? {}) as Record<string, unknown>
    const message =
      typeof record.error === 'string'
        ? record.error
        : typeof record.message === 'string'
          ? record.message
          : response.status === 404
            ? 'The API endpoint was not found. Check the deployment API routing.'
            : `Request failed (${response.status})`
    throw new ApiError(response.status, message, record.details)
  }

  return payload as T
}
