import 'dotenv/config'
import { PullRequest, Summary } from '../types'

const REPO_PATH = '/repos/downshift-js/downshift/pulls'
const PER_PAGE = 100

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

  const response = await fetch(url, { headers })
  if (!response.ok) throw new Error(`GitHub responded with ${response.status}`)
  return { pulls: (await response.json()) as PullRequest[], next: nextPageUrl(response.headers.get('link')) }
}

// Follows GitHub's Link header rather than guessing page numbers. Oldest-first ordering keeps
// PRs opened mid-crawl on the last page instead of shifting earlier pages; ids dedupe any overlap.
export const getAllPullRequests = async (): Promise<PullRequest[]> => {
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
    if (url && url.origin !== base.origin) throw new Error('GitHub returned a next-page link on another host')
  }
  return [...byNumber.values()]
}

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
