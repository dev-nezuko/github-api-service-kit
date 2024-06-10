import http from 'node:http'
import { AddressInfo } from 'node:net'

export interface FakePull {
  number: number
  created_at: string | null
  closed_at: string | null
}

export type FakeHandler = (url: URL, res: http.ServerResponse, req: http.IncomingMessage) => void

export interface FakeGithub {
  url: string
  requests: { url: URL; headers: http.IncomingHttpHeaders }[]
  close: () => Promise<void>
}

// Local stand-in for the GitHub REST API so tests and demos never reach api.github.com.
export const startFakeGithub = async (handler: FakeHandler, port = 0): Promise<FakeGithub> => {
  const requests: FakeGithub['requests'] = []
  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://fake.invalid')
    requests.push({ url, headers: req.headers })
    handler(url, res, req)
  })
  await new Promise<void>(resolve => server.listen(port, '127.0.0.1', resolve))
  const { port: bound } = server.address() as AddressInfo
  return {
    url: `http://127.0.0.1:${bound}`,
    requests,
    close: () => new Promise(resolve => { server.closeAllConnections(); server.close(() => resolve()) }),
  }
}

// Serves `pulls` the way GitHub pages them: per_page/page query params and an RFC 8288 Link header.
export const pagedPulls = (pulls: FakePull[]): FakeHandler => (url, res) => {
  if (url.pathname !== '/repos/downshift-js/downshift/pulls') {
    res.writeHead(404, { 'content-type': 'application/json' }).end('{"message":"Not Found"}')
    return
  }
  const perPage = Number(url.searchParams.get('per_page') ?? 30)
  const page = Number(url.searchParams.get('page') ?? 1)
  const body = pulls.slice((page - 1) * perPage, page * perPage)
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (page * perPage < pulls.length) {
    const next = new URL(url.toString())
    next.searchParams.set('page', String(page + 1))
    headers.link = `<http://${res.req.headers.host}${next.pathname}${next.search}>; rel="next"`
  }
  res.writeHead(200, headers).end(JSON.stringify(body))
}

// Deterministic synthetic history used by the README example: 230 PRs across 2021-2022.
export const demoPulls = (): FakePull[] =>
  Array.from({ length: 230 }, (_, i) => {
    const created = Date.UTC(2021, 8, 1) + i * 1.3 * 86_400_000
    const closed = i % 4 === 0 ? null : created + ((i * 7) % 40) * 86_400_000
    return {
      number: i + 1,
      created_at: new Date(created).toISOString(),
      closed_at: closed === null ? null : new Date(closed).toISOString(),
    }
  })

if (require.main === module) {
  const port = Number(process.env.FAKE_GITHUB_PORT ?? 4010)
  startFakeGithub(pagedPulls(demoPulls()), port).then(fake => console.log(`Fake GitHub API at ${fake.url}`))
}
