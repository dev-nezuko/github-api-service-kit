import request from 'supertest'
import { getAllPullRequests } from '../src/controllers/RepoController'
jest.mock('../src/controllers/RepoController', () => ({
  ...jest.requireActual('../src/controllers/RepoController'),
  getAllPullRequests: jest.fn(),
}))
import app from '../src/app'
const getPulls = getAllPullRequests as jest.Mock
const fixture = [
  { created_at: '2021-09-01T00:01:00Z', closed_at: '2021-10-01T00:00:00Z' },
  { created_at: '2021-09-10T12:00:00Z', closed_at: null },
]
beforeEach(() => { getPulls.mockReset(); getPulls.mockResolvedValue(fixture) })
it('summarizes opened and closed events in sorted UTC months', async () => {
  const response = await request(app).get('/api/v1/repo/stats')
  expect(response.status).toBe(200)
  expect(response.body).toEqual([
    { month: 'September 2021', opened: 2, closed: 0 },
    { month: 'October 2021', opened: 0, closed: 1 },
  ])
})
it('selects a numeric month including unpadded input', async () => {
  const response = await request(app).get('/api/v1/repo/stats/summary?month=9&year=2021')
  expect(response.status).toBe(200)
  expect(response.body).toEqual({ month: 'September 2021', opened: 2, closed: 0 })
})
it('filters a year', async () => {
  const response = await request(app).get('/api/v1/repo/stats/year-summary?year=2021')
  expect(response.status).toBe(200)
  expect(response.body).toHaveLength(2)
})
it.each(['summary', 'summary?month=13&year=2021', 'summary?month=09&year=bad', 'summary?month=9&month=10&year=2021', 'year-summary?year=2021junk', 'year-summary'])('rejects invalid query before upstream access: %s', async path => {
  expect((await request(app).get('/api/v1/repo/stats/' + path)).status).toBe(400)
  expect(getPulls).not.toHaveBeenCalled()
})
it('returns 404 for absent month', async () => {
  expect((await request(app).get('/api/v1/repo/stats/summary?month=1&year=2021')).status).toBe(404)
})
it('handles provider failure without returning provider details', async () => {
  getPulls.mockRejectedValue(new Error('private upstream diagnostic'))
  const response = await request(app).get('/api/v1/repo/stats')
  expect(response.status).toBe(502)
  expect(JSON.stringify(response.body)).not.toContain('private upstream')
})
