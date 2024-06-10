const list = jest.fn()
jest.mock('@octokit/rest', () => ({ Octokit: jest.fn(() => ({ rest: { pulls: { list: (...args: unknown[]) => list(...args) } } })) }))
import { getAllPullRequests } from '../src/controllers/RepoController'
it('stops at a partial page without requesting speculative pages', async () => {
  const first = Array.from({ length: 100 }, () => ({ created_at: '2021-09-01T00:00:00Z', closed_at: null }))
  list.mockResolvedValueOnce({ data: first }).mockResolvedValueOnce({ data: [first[0]] })
  expect(await getAllPullRequests()).toHaveLength(101)
  expect(list).toHaveBeenCalledTimes(2)
  expect(list.mock.calls.map(call => call[0].page)).toEqual([1, 2])
})
