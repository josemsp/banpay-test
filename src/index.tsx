import { Hono } from 'hono'
import { renderer } from './renderer'
import auth from './routes/auth'
import users from './routes/users'
import type { AppEnv } from './types'

const app = new Hono<AppEnv>()

app.use(renderer)

// Health check
app.get('/', (c) => {
  return c.render(<h1>Hello!</h1>)
})

app.get('/health', (c) => {
  return c.json({
    status: 'ok',
    service: 'users-api',
  });
});

// Feature routes
app.route('/api/v1/auth', auth)
app.route('/api/v1/users', users)

export default app
