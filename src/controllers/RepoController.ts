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

export const summarizePullRequestsByMonth = (pullRequests: PullRequest[]): Summary[] => {
  const summary: Summary[] = []
  const months: { [key: string]: { opened: number , closed: number } } = {}

  pullRequests.forEach((pullRequest) => {
    const createdMonth = pullRequest.created_at
      ? new Date(pullRequest.created_at).toISOString().slice(0, 7)
      : ''
    const closedMonth = pullRequest.closed_at
      ? new Date(pullRequest.closed_at).toISOString().slice(0, 7)
      : ''

    if (!months[createdMonth]) {
      months[createdMonth] = { opened: 0, closed: 0 }
    }
    months[createdMonth].opened++

    if (closedMonth) {
      if (!months[closedMonth]) {
        months[closedMonth] = { opened: 0, closed: 0 }
      }
      months[closedMonth].closed++
    }
  })

  for (const month of Object.keys(months).sort()) {
    summary.push({
      month: new Date(month + '-01T00:00:00Z').toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }),
      opened: months[month].opened,
      closed: months[month].closed,
    })
  }

  return summary
}
