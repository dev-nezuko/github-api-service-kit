import express, { Request, Response } from 'express'
import { getAllPullRequests, summarizePullRequestsByMonth } from '../controllers/RepoController'

const router = express.Router()

const MONTH = { pattern: /^(0?[1-9]|1[0-2])$/, hint: 'month must be 1-12' }
const YEAR = { pattern: /^[1-9][0-9]{3}$/, hint: 'year must have four digits' }

// Repeated parameters (?year=2021&year=2022) arrive as arrays and are rejected as invalid.
const invalidQuery = (query: Request['query'], rules: Record<string, typeof MONTH>): string | null => {
  const names = Object.keys(rules)
  if (names.some(name => query[name] === undefined)) return `Query parameters required: ${names.join(', ')}.`
  const bad = names.filter(name => typeof query[name] !== 'string' || !rules[name].pattern.test(query[name] as string))
  return bad.length ? `Invalid query: ${bad.map(name => rules[name].hint).join(', ')}, each given once.` : null
}

// Express 5 forwards rejected promises from these handlers to the error middleware in app.ts.
router.get('/', async (_req: Request, res: Response) => {
  res.send(summarizePullRequestsByMonth(await getAllPullRequests()))
})

router.get('/summary', async (req: Request, res: Response) => {
  const error = invalidQuery(req.query, { month: MONTH, year: YEAR })
  if (error) return res.status(400).send({ error })
  const month = req.query.month as string
  const year = req.query.year as string

  const [monthSummary] = summarizePullRequestsByMonth(await getAllPullRequests(), `${year}-${month.padStart(2, '0')}`)
  if (!monthSummary) return res.status(404).send({ error: 'No data found for the given month and year.' })

  res.send(monthSummary)
})

router.get('/year-summary', async (req: Request, res: Response) => {
  const error = invalidQuery(req.query, { year: YEAR })
  if (error) return res.status(400).send({ error })
  const year = req.query.year as string

  const yearSummary = summarizePullRequestsByMonth(await getAllPullRequests(), `${year}-`)
  if (yearSummary.length === 0) return res.status(404).send({ error: 'No data found for the given year.' })

  res.send(yearSummary)
})

export default router
