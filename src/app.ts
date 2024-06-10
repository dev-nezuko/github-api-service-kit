import 'dotenv/config'
import express from 'express'
import router from './routes'
import { UpstreamError } from './controllers/RepoController'
import swaggerUi from 'swagger-ui-express'
import YAML from 'yamljs'
import path from 'path'

const swaggerDocument = YAML.load(path.join(__dirname, '../docs/api-spec.yaml'))

const app = express()
const base = process.env.API_VERSION || '/api/v1'

app.use(`${base}/repo/stats`, router)
app.use(`${base}/api-docs`, swaggerUi.serve, swaggerUi.setup(swaggerDocument))

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err instanceof UpstreamError) {
    if (err.retryAfterSeconds) res.set('Retry-After', String(err.retryAfterSeconds))
    return res.status(err.status).json({ error: err.message })
  }
  console.error(err)
  res.status(500).json({ error: 'Internal server error.' })
})

if (require.main === module) {
  const port = Number(process.env.PORT || 3000)
  app.listen(port, '127.0.0.1', () => console.log(`Server listening on port ${port}`))
}
export default app
