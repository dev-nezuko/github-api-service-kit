import express, { Request, Response } from 'express'
import { getAllPullRequests, summarizePullRequestsByMonth } from '../controllers/RepoController'
import { Summary } from '../types'

const router = express.Router()

router.get('/', async (req: Request, res: Response, next) => {
  try {
  const pullRequests = await getAllPullRequests()
  const summary: Summary[] = summarizePullRequestsByMonth(pullRequests)

  res.send(summary)
  } catch (error) { next(error) }
})

router.get('/summary', async (req: Request, res: Response, next) => {
  try {
  const { month, year } = req.query

  if (typeof month !== 'string' || !/^(0?[1-9]|1[0-2])$/.test(month) || typeof year !== 'string' || !/^[1-9][0-9]{3}$/.test(year)) {
    return res.status(400).send({ error: 'Both month and year query parameters are required.' })
  }

  const pullRequests = await getAllPullRequests()
  const [monthSummary] = summarizePullRequestsByMonth(pullRequests, `${year}-${month.padStart(2, '0')}`)

  if (!monthSummary) return res.status(404).send({ error: 'No data found for the given month and year.' })

  res.send(monthSummary)
  } catch (error) { next(error) }
})

router.get('/year-summary', async (req: Request, res: Response, next) => {
  try {
  const { year } = req.query

  if (typeof year !== 'string' || !/^[1-9][0-9]{3}$/.test(year)) return res.status(400).send({ error: 'The year query parameter is required.' })

  const pullRequests = await getAllPullRequests()
  const yearSummary = summarizePullRequestsByMonth(pullRequests, `${year}-`)

  if (yearSummary.length === 0) return res.status(404).send({ error: 'No data found for the given year.' })

  res.send(yearSummary)
  } catch (error) { next(error) }
})

export default router
