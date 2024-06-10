import { Octokit } from '@octokit/rest'
import 'dotenv/config'
import { PullRequest, Summary } from '../types'

const octokit = new Octokit({
  auth: process.env.GITHUB_PERSONAL_ACCESS_TOKEN,
})

const getPullRequests = async (page: number): Promise<PullRequest[]> => {
  const response = await octokit.rest.pulls.list({
    owner: 'downshift-js',
    repo: 'downshift',
    state: 'all',
    page: page,
    per_page: 100,
  })
  return response.data
}

export const getAllPullRequests = async (): Promise<PullRequest[]> => {
  const pullRequests: PullRequest[] = []
  for (let page = 1; ; page++) {
    const batch = await getPullRequests(page)
    pullRequests.push(...batch)
    if (batch.length < 100) break
  }

  return pullRequests
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
