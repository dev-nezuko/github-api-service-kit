import { clearPullRequestCache, getAllPullRequests, UpstreamError } from '../src/controllers/RepoController'
import { FakeGithub, FakePull, pagedPulls, startFakeGithub } from './support/fakeGithub'

const pulls = (count: number, from = 1): FakePull[] =>
  Array.from({ length: count }, (_, i) => ({ number: from + i, created_at: '2021-09-01T00:00:00Z', closed_at: null }))

let fake: FakeGithub
const serve = async (handler: Parameters<typeof startFakeGithub>[0]) => {
  fake = await startFakeGithub(handler)
  process.env.GITHUB_API_URL = fake.url
}
beforeEach(() => { clearPullRequestCache(); process.env.CACHE_TTL_SECONDS = '0' })
afterEach(async () => {
  await fake?.close()
  for (const key of ['GITHUB_API_URL', 'GITHUB_PERSONAL_ACCESS_TOKEN', 'GITHUB_TIMEOUT_MS', 'CACHE_TTL_SECONDS']) delete process.env[key]
})

it('follows Link headers until the last page, oldest first', async () => {
  await serve(pagedPulls(pulls(201)))
  expect(await getAllPullRequests()).toHaveLength(201)
  expect(fake.requests.map(r => r.url.searchParams.get('page'))).toEqual([null, '2', '3'])
  const first = fake.requests[0].url.searchParams
  expect(first.get('state')).toBe('all')
  expect(first.get('per_page')).toBe('100')
  expect(first.get('sort')).toBe('created')
  expect(first.get('direction')).toBe('asc')
})

it('stops after an exactly full last page without a speculative extra request', async () => {
  await serve(pagedPulls(pulls(100)))
  expect(await getAllPullRequests()).toHaveLength(100)
  expect(fake.requests).toHaveLength(1)
})

it('counts a PR once when it appears on two pages', async () => {
  const all = pulls(150)
  await serve((url, res) => {
    // A PR shifted across the page boundary between requests, so page 2 repeats #100.
    const page2 = url.searchParams.get('page') === '2'
    const headers: Record<string, string> = { 'content-type': 'application/json' }
    if (!page2) headers.link = `<${fake.url}${url.pathname}?page=2>; rel="next"`
    res.writeHead(200, headers).end(JSON.stringify(page2 ? all.slice(99) : all.slice(0, 100)))
  })
  expect(await getAllPullRequests()).toHaveLength(150)
})

it('sends the optional token only to the configured API host', async () => {
  process.env.GITHUB_PERSONAL_ACCESS_TOKEN = 'test-token'
  await serve((_url, res) => {
    res.writeHead(200, { 'content-type': 'application/json', link: '<http://elsewhere.invalid/next>; rel="next"' }).end('[]')
  })
  await expect(getAllPullRequests()).rejects.toThrow('another host')
  expect(fake.requests).toHaveLength(1)
  expect(fake.requests[0].headers.authorization).toBe('Bearer test-token')
})

const failure = () => getAllPullRequests().then(() => { throw new Error('expected a rejection') }, (error: UpstreamError) => error)

it('maps an upstream error status to 502', async () => {
  await serve((_url, res) => { res.writeHead(500).end() })
  expect(await failure()).toMatchObject({ status: 502, message: 'GitHub responded with 500.' })
})

it('reports primary rate limiting as 503 with the reset delay', async () => {
  const reset = Math.floor(Date.now() / 1000) + 120
  await serve((_url, res) => {
    res.writeHead(403, { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(reset) }).end('{"message":"API rate limit exceeded"}')
  })
  const error = await failure()
  expect(error).toMatchObject({ status: 503 })
  expect(error.retryAfterSeconds).toBeGreaterThanOrEqual(115)
  expect(error.retryAfterSeconds).toBeLessThanOrEqual(121)
})

it('honours Retry-After on secondary rate limits', async () => {
  await serve((_url, res) => { res.writeHead(429, { 'retry-after': '30' }).end() })
  expect(await failure()).toMatchObject({ status: 503, retryAfterSeconds: 30 })
})

it('times out a stalled upstream with 504', async () => {
  process.env.GITHUB_TIMEOUT_MS = '150'
  await serve(() => { /* never answers */ })
  expect(await failure()).toMatchObject({ status: 504 })
})

it('rejects a non-array body', async () => {
  await serve((_url, res) => { res.writeHead(200, { 'content-type': 'application/json' }).end('{"message":"moved"}') })
  expect(await failure()).toMatchObject({ status: 502 })
})

describe('caching', () => {
  it('shares one crawl between concurrent callers and reuses it within the TTL', async () => {
    process.env.CACHE_TTL_SECONDS = '60'
    await serve(pagedPulls(pulls(150)))
    const [a, b] = await Promise.all([getAllPullRequests(), getAllPullRequests()])
    expect(a).toBe(b)
    await getAllPullRequests()
    expect(fake.requests).toHaveLength(2)
  })

  it('refetches once the TTL has passed', async () => {
    await serve(pagedPulls(pulls(5)))
    await getAllPullRequests()
    await getAllPullRequests()
    expect(fake.requests).toHaveLength(2)
  })

  it('does not cache a failed crawl', async () => {
    process.env.CACHE_TTL_SECONDS = '60'
    let calls = 0
    await serve((url, res, req) => {
      if (calls++ === 0) res.writeHead(500).end()
      else pagedPulls(pulls(3))(url, res, req)
    })
    await expect(getAllPullRequests()).rejects.toMatchObject({ status: 502 })
    expect(await getAllPullRequests()).toHaveLength(3)
  })
})
