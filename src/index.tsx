import { Hono } from 'hono'
import { renderer } from './renderer'
import { requireAdmin, requireAuth } from './middleware/auth';
import { createSupabaseAdminClient } from './lib/supabase';

type Bindings = {
  SUPABASE_URL: string;
  SUPABASE_PUBLISHABLE_KEY: string;
  SUPABASE_SECRET_KEY: string;
};

const app = new Hono<{ Bindings: Bindings }>()

app.use(renderer)

app.get('/', (c) => {
  return c.render(<h1>Hello!</h1>)
})

app.get('/health', (c) => {
  return c.json({
    status: 'ok',
    service: 'users-api',
  });
});


app.get(
  '/api/v1/users',
  requireAuth,
  requireAdmin,
  async (c) => {
    const page = Number(c.req.query('page') ?? '1');
    const limit = Number(c.req.query('limit') ?? '20');

    if (
      !Number.isInteger(page) ||
      !Number.isInteger(limit) ||
      page < 1 ||
      limit < 1 ||
      limit > 100
    ) {
      return c.json(
        { error: 'Parámetros de paginación inválidos' },
        400,
      );
    }

    const from = (page - 1) * limit;
    const to = from + limit - 1;

    const supabase = createSupabaseAdminClient(c.env);

    const { data, error, count } = await supabase
      .from('profiles')
      .select(
        'id, name, email, role, created_at, updated_at',
        { count: 'exact' },
      )
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) {
      return c.json({ error: 'No se pudieron obtener los usuarios' }, 500);
    }

    return c.json({
      data,
      pagination: {
        page,
        limit,
        total: count ?? 0,
        totalPages: Math.ceil((count ?? 0) / limit),
      },
    });
  },
);


export default app
