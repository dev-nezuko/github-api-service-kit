import 'dotenv/config'
import { PullRequest, Summary } from '../types'

const REPO_PATH = '/repos/downshift-js/downshift/pulls'
const PER_PAGE = 100
const DEFAULT_TIMEOUT_MS = 10_000

// Carries the HTTP status this API should answer with; the message is safe to show clients.
export class UpstreamError extends Error {
  constructor(message: string, readonly status: number, readonly retryAfterSeconds?: number) {
    super(message)
    this.name = 'UpstreamError'
  }
}

const retryAfterSeconds = (headers: Headers): number | undefined => {
  const retryAfter = Number(headers.get('retry-after'))
  if (retryAfter > 0) return Math.ceil(retryAfter)
  const reset = Number(headers.get('x-ratelimit-reset'))
  return reset > 0 ? Math.max(1, Math.ceil(reset - Date.now() / 1000)) : undefined
}

const isRateLimited = (response: Response): boolean =>
  response.status === 429 ||
  (response.status === 403 && (response.headers.get('x-ratelimit-remaining') === '0' || response.headers.has('retry-after')))

const nextPageUrl = (link: string | null): string | null =>
  link?.match(/<([^>]+)>\s*;\s*rel="next"/)?.[1] ?? null

const requestPage = async (url: URL): Promise<{ pulls: PullRequest[]; next: string | null }> => {
  const headers: Record<string, string> = {
    accept: 'application/vnd.github+json',
    'x-github-api-version': '2022-11-28',
    'user-agent': 'github-api-service-kit',
  }
  const token = process.env.GITHUB_PERSONAL_ACCESS_TOKEN
  if (token) headers.authorization = `Bearer ${token}`

  const timeoutMs = Number(process.env.GITHUB_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS
  let response: Response
  try {
    response = await fetch(url, { headers, signal: AbortSignal.timeout(timeoutMs) })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'TimeoutError') {
      throw new UpstreamError('GitHub did not respond in time. Try again later.', 504)
    }
    throw new UpstreamError('Unable to reach GitHub. Try again later.', 502)
  }

  if (isRateLimited(response)) {
    throw new UpstreamError('GitHub rate limit reached. Try again later.', 503, retryAfterSeconds(response.headers))
  }
  if (!response.ok) throw new UpstreamError(`GitHub responded with ${response.status}.`, 502)

  const pulls: unknown = await response.json().catch(() => null)
  if (!Array.isArray(pulls)) throw new UpstreamError('GitHub returned an unexpected response.', 502)
  return { pulls: pulls as PullRequest[], next: nextPageUrl(response.headers.get('link')) }
}

// Follows GitHub's Link header rather than guessing page numbers. Oldest-first ordering keeps
// PRs opened mid-crawl on the last page instead of shifting earlier pages; ids dedupe any overlap.
const crawlPullRequests = async (): Promise<PullRequest[]> => {
  const base = new URL(process.env.GITHUB_API_URL || 'https://api.github.com')
  const first = new URL(REPO_PATH, base)
  first.search = new URLSearchParams({ state: 'all', sort: 'created', direction: 'asc', per_page: String(PER_PAGE) }).toString()

  const byNumber = new Map<number, PullRequest>()
  let url: URL | null = first
  while (url) {
    const { pulls, next } = await requestPage(url)
    for (const pull of pulls) byNumber.set(pull.number, pull)
    url = next ? new URL(next) : null
    // Never forward the token to a host other than the configured API.
    if (url && url.origin !== base.origin) throw new UpstreamError('GitHub returned a next-page link on another host.', 502)
  }
  return [...byNumber.values()]
}

const DEFAULT_CACHE_TTL_SECONDS = 300
let cached: { pulls: Promise<PullRequest[]>; expiresAt: number } | null = null

// A full crawl is ~20 requests and unauthenticated clients get 60 an hour, so concurrent requests
// share one crawl and a successful result is reused for CACHE_TTL_SECONDS. Failures are not cached.
export const getAllPullRequests = (): Promise<PullRequest[]> => {
  if (cached && Date.now() < cached.expiresAt) return cached.pulls

  const configured = Number(process.env.CACHE_TTL_SECONDS ?? DEFAULT_CACHE_TTL_SECONDS)
  const ttlMs = (Number.isFinite(configured) && configured >= 0 ? configured : DEFAULT_CACHE_TTL_SECONDS) * 1000
  const entry = { pulls: crawlPullRequests(), expiresAt: Infinity }
  cached = entry
  entry.pulls.then(
    () => { entry.expiresAt = Date.now() + ttlMs },
    () => { if (cached === entry) cached = null },
  )
  return entry.pulls
}

export const clearPullRequestCache = (): void => { cached = null }

// "YYYY-MM" in UTC, or null when the timestamp is missing or unparseable.
const monthKey = (timestamp: string | null | undefined): string | null => {
  if (!timestamp) return null
  const date = new Date(timestamp)
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 7)
}

const monthLabel = (key: string): string =>
  new Date(`${key}-01T00:00:00Z`).toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })

export const countPullRequestsByMonth = (pullRequests: PullRequest[]): Map<string, { opened: number; closed: number }> => {
  const months = new Map<string, { opened: number; closed: number }>()
  const bucket = (key: string) => {
    let counts = months.get(key)
    if (!counts) months.set(key, (counts = { opened: 0, closed: 0 }))
    return counts
  }

  for (const pullRequest of pullRequests) {
    const opened = monthKey(pullRequest.created_at)
    const closed = monthKey(pullRequest.closed_at)
    if (opened) bucket(opened).opened++
    if (closed) bucket(closed).closed++
  }
  return months
}

export const summarizePullRequestsByMonth = (pullRequests: PullRequest[], keyPrefix = ''): Summary[] =>
  [...countPullRequestsByMonth(pullRequests)]
    .filter(([key]) => key.startsWith(keyPrefix))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, counts]) => ({ month: monthLabel(key), ...counts }))
