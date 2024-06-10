import express, { Request, Response } from 'express'
import { getAllPullRequests, summarizePullRequestsByMonth } from '../controllers/RepoController'

const router = express.Router()

// Express 5 forwards rejected promises from these handlers to the error middleware in app.ts.
router.get('/', async (_req: Request, res: Response) => {
  res.send(summarizePullRequestsByMonth(await getAllPullRequests()))
})

router.get('/summary', async (req: Request, res: Response) => {
  const { month, year } = req.query

  if (typeof month !== 'string' || !/^(0?[1-9]|1[0-2])$/.test(month) || typeof year !== 'string' || !/^[1-9][0-9]{3}$/.test(year)) {
    return res.status(400).send({ error: 'Both month and year query parameters are required.' })
  }

  const [monthSummary] = summarizePullRequestsByMonth(await getAllPullRequests(), `${year}-${month.padStart(2, '0')}`)
  if (!monthSummary) return res.status(404).send({ error: 'No data found for the given month and year.' })

  res.send(monthSummary)
})

router.get('/year-summary', async (req: Request, res: Response) => {
  const { year } = req.query

  if (typeof year !== 'string' || !/^[1-9][0-9]{3}$/.test(year)) return res.status(400).send({ error: 'The year query parameter is required.' })

  const yearSummary = summarizePullRequestsByMonth(await getAllPullRequests(), `${year}-`)
  if (yearSummary.length === 0) return res.status(404).send({ error: 'No data found for the given year.' })

  res.send(yearSummary)
})

export default router
