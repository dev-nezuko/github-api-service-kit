import request from 'supertest'
import app from '../src/app'
import { clearPullRequestCache, summarizePullRequestsByMonth } from '../src/controllers/RepoController'
import { PullRequest } from '../src/types'
import { demoPulls, FakeGithub, pagedPulls, startFakeGithub } from './support/fakeGithub'

// Full stack: Express routes -> fetch crawler -> local fake GitHub serving 230 synthetic PRs.
let fake: FakeGithub
beforeAll(async () => {
  fake = await startFakeGithub(pagedPulls(demoPulls()))
  process.env.GITHUB_API_URL = fake.url
})
beforeEach(() => clearPullRequestCache())
afterAll(async () => {
  await fake.close()
  delete process.env.GITHUB_API_URL
})

const expected = summarizePullRequestsByMonth(demoPulls() as PullRequest[])

it('summarizes every month after crawling all three pages', async () => {
  const response = await request(app).get('/api/v1/repo/stats')
  expect(response.status).toBe(200)
  expect(response.body).toEqual(expected)
  expect(response.body.reduce((sum: number, month: { opened: number }) => sum + month.opened, 0)).toBe(230)
  expect(fake.requests.length).toBeGreaterThanOrEqual(3)
})

it('returns one month and one year from the same data', async () => {
  const october = await request(app).get('/api/v1/repo/stats/summary?month=10&year=2021')
  expect(october.status).toBe(200)
  expect(october.body).toEqual(expected.find(month => month.month === 'October 2021'))

  const year = await request(app).get('/api/v1/repo/stats/year-summary?year=2022')
  expect(year.body).toEqual(expected.filter(month => month.month.endsWith('2022')))
})

it('serves the Swagger UI', async () => {
  const response = await request(app).get('/api/v1/api-docs/')
  expect(response.status).toBe(200)
  expect(response.text).toContain('swagger-ui')
})
