import 'dotenv/config'
import express from 'express'
import router from './routes'
import swaggerUi from 'swagger-ui-express'
import YAML from 'yamljs'
import path from 'path'

const swaggerDocument = YAML.load(path.join(__dirname, '../docs/api-spec.yaml'))

const app = express()
const base = process.env.API_VERSION || '/api/v1'

app.use(`${base}/repo/stats`, router)
app.use(`${base}/api-docs`, swaggerUi.serve, swaggerUi.setup(swaggerDocument))

app.use((_err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  res.status(502).json({ error: 'Unable to retrieve GitHub pull requests. Try again later.' })
})

if (require.main === module) {
  const port = Number(process.env.PORT || 3000)
  app.listen(port, '127.0.0.1', () => console.log(`Server listening on port ${port}`))
}
export default app
