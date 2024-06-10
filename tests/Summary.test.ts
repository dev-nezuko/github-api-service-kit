import { summarizePullRequestsByMonth } from '../src/controllers/RepoController'
import { PullRequest } from '../src/types'

const pr = (created_at: string | null, closed_at: string | null = null) => ({ created_at, closed_at }) as PullRequest

it('buckets by UTC month even near midnight with an offset timestamp', () => {
  expect(summarizePullRequestsByMonth([pr('2021-10-01T01:30:00+02:00', '2021-10-31T23:59:59-01:00')])).toEqual([
    { month: 'September 2021', opened: 1, closed: 0 },
    { month: 'November 2021', opened: 0, closed: 1 },
  ])
})

it('skips missing or unparseable timestamps instead of inventing an "Invalid Date" month', () => {
  const summary = summarizePullRequestsByMonth([pr(null, '2021-09-02T00:00:00Z'), pr('not a date'), pr('2021-09-01T00:00:00Z')])
  expect(summary).toEqual([{ month: 'September 2021', opened: 1, closed: 1 }])
})

it('sorts chronologically across years and filters by key prefix', () => {
  const pulls = [pr('2022-01-05T00:00:00Z'), pr('2021-12-05T00:00:00Z'), pr('2021-02-05T00:00:00Z')]
  expect(summarizePullRequestsByMonth(pulls).map(s => s.month)).toEqual(['February 2021', 'December 2021', 'January 2022'])
  expect(summarizePullRequestsByMonth(pulls, '2021-').map(s => s.month)).toEqual(['February 2021', 'December 2021'])
  expect(summarizePullRequestsByMonth(pulls, '2021-12')).toHaveLength(1)
})
