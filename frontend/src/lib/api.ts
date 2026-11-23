// Thin client for the Laravel API. Session cookie + XSRF header; every error becomes an ApiError
// with the child-friendly message the server sent.

import { BASE } from './demo'

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public retryAfter: number | null = null,
    public extra: Record<string, unknown> = {},
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

function xsrf(): string | null {
  const m = document.cookie.match(/(?:^|; )XSRF-TOKEN=([^;]+)/)
  return m ? decodeURIComponent(m[1]) : null
}

let onUnauthenticated: (() => void) | null = null
export function setUnauthenticatedHandler(fn: () => void): void {
  onUnauthenticated = fn
}

const FRIENDLY: Record<number, string> = {
  0: 'We could not reach the lab server. Check the internet connection and try again.',
  401: 'Please enter the lab password again.',
  413: 'That is too big for the lab to store.',
  419: 'The page was open for a long time. Please try again.',
  429: 'The lab is taking a short break. Try again in a moment.',
  500: 'Something went wrong in the lab. Please try again.',
}

const JSON_HEADERS = { Accept: 'application/json' }

async function touchSession(): Promise<void> {
  try {
    await fetch(`${BASE}/api/session`, { credentials: 'same-origin', headers: JSON_HEADERS })
  } catch {
    /* handled by the real request */
  }
}

async function request<T>(method: string, url: string, body?: unknown, retried = false): Promise<T> {
  const headers: Record<string, string> = { ...JSON_HEADERS, 'X-Requested-With': 'XMLHttpRequest' }
  let payload: BodyInit | undefined
  if (body instanceof FormData) payload = body
  else if (body !== undefined) {
    headers['Content-Type'] = 'application/json'
    payload = JSON.stringify(body)
  }
  if (method !== 'GET') {
    if (!xsrf()) await touchSession()
    const token = xsrf()
    if (token) headers['X-XSRF-TOKEN'] = token
  }
  let res: Response
  try {
    res = await fetch(BASE + url, { method, headers, body: payload, credentials: 'same-origin' })
  } catch {
    throw new ApiError(0, 'network', FRIENDLY[0])
  }
  if (res.status === 419 && !retried) {
    await touchSession()
    return request<T>(method, url, body, true)
  }
  const text = await res.text()
  let json: Record<string, unknown> | null = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = null
  }
  if (!res.ok) {
    const code = typeof json?.code === 'string' ? json.code : `http_${res.status}`
    const message = typeof json?.message === 'string' && json.message ? json.message : (FRIENDLY[res.status] ?? FRIENDLY[500])
    if (res.status === 401 && code === 'unauthenticated') onUnauthenticated?.()
    throw new ApiError(res.status, code, message, typeof json?.retryAfter === 'number' ? json.retryAfter : null, json ?? {})
  }
  return json as T
}

export interface SessionInfo {
  authenticated: boolean
  /** true on the public demo: no password, own projects only, offline AI */
  demo?: boolean
  limits: { maxUploadMb: number; maxScreenshotsPerProject: number; maxImageDimension: number; maxAiRequestsPerHour: number; aiRemaining: number }
  vision: { driver: string; live: boolean }
  assistant: { available: boolean }
}

export interface ScreenshotInfo {
  id: string
  position: number
  url: string
  width: number
  height: number
  mime: string
}

export interface MatImageInfo {
  id: string
  url: string
  width: number
  height: number
}
export interface ProjectSummary {
  id: string
  name: string
  updatedAt: string
  screenshotCount: number
  firstScreenshotUrl: string | null
  summary: string | null
  /** a saved table (made once, copied onto programs) */
  table: boolean
  matImageUrl: string | null
}

export interface ProjectRecord {
  id: string
  name: string
  data: unknown
  screenshots: ScreenshotInfo[]
  /** the straightened photo of a table used as the floor, if any */
  matImage: MatImageInfo | null
  table: boolean
  createdAt: string
  updatedAt: string
}

export const api = {
  session: () => request<SessionInfo>('GET', '/api/session'),
  login: (password: string) => request<{ authenticated: boolean }>('POST', '/api/login', { password }),
  logout: () => request<unknown>('POST', '/api/logout'),
  usage: () => request<Record<string, unknown>>('GET', '/api/usage'),
  projects: () => request<ProjectSummary[]>('GET', '/api/projects'),
  /** every saved table (not limited to the newest projects) */
  tables: () => request<ProjectSummary[]>('GET', '/api/projects?tables=1'),
  createProject: (name: string, data: unknown, table = false) => request<ProjectRecord>('POST', '/api/projects', table ? { name, data, table: true } : { name, data }),
  project: (id: string) => request<ProjectRecord>('GET', `/api/projects/${id}`),
  updateProject: (id: string, patch: { name?: string; data?: unknown }) => request<ProjectRecord>('PUT', `/api/projects/${id}`, patch),
  deleteProject: (id: string) => request<unknown>('DELETE', `/api/projects/${id}`),
  duplicateProject: (id: string) => request<ProjectRecord>('POST', `/api/projects/${id}/duplicate`),
  uploadScreenshot: (id: string, file: Blob, name: string, replaces?: string) => {
    const fd = new FormData()
    fd.append('image', file, name)
    if (replaces) fd.append('replaces', replaces)
    return request<ScreenshotInfo>('POST', `/api/projects/${id}/screenshots`, fd)
  },
  uploadMatImage: (id: string, picture: Blob) => {
    const fd = new FormData()
    fd.append('image', picture, 'table.jpg')
    return request<MatImageInfo>('POST', `/api/projects/${id}/mat-image`, fd)
  },
  deleteMatImage: (id: string) => request<unknown>('DELETE', `/api/projects/${id}/mat-image`),
  /** copy a saved table's picture onto this project; `tableData` is the table's document, for its scene */
  useTable: (id: string, tableId: string) => request<ProjectRecord & { tableData: unknown }>('POST', `/api/projects/${id}/use-table`, { tableId }),
  orderScreenshots: (id: string, ids: string[]) => request<ScreenshotInfo[]>('PUT', `/api/projects/${id}/screenshots/order`, { ids }),
  deleteScreenshot: (id: string, sid: string) => request<unknown>('DELETE', `/api/projects/${id}/screenshots/${sid}`),
  recognise: (id: string, screenshotIds?: string[]) =>
    request<{ raw: unknown; driver: string; model: string | null; screenshotIds: string[] }>('POST', `/api/projects/${id}/recognise`, screenshotIds ? { screenshotIds } : {}),
  explain: (blockText: string, programText: string) => request<{ text: string }>('POST', '/api/ai/explain', { blockText, programText }),
  proposeScene: (description: string) => request<{ raw: unknown }>('POST', '/api/ai/scene', { description }),
  exportProject: (id: string) => request<Record<string, unknown>>('GET', `/api/projects/${id}/export`),
  importProject: (doc: unknown) => request<ProjectRecord>('POST', '/api/projects/import', doc),
}
