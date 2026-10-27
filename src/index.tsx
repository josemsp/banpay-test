import { Hono } from 'hono'
import { renderer } from './renderer'
import { requireAdmin, requireAuth } from './middleware/auth';
import { createSupabaseAdminClient, createSupabaseClient } from './lib/supabase';

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


app.post('/api/v1/auth/login', async (c) => {
  let body: unknown;

  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'El cuerpo debe ser JSON válido' }, 400);
  }

  if (
    typeof body !== 'object' ||
    body === null ||
    !('email' in body) ||
    !('password' in body) ||
    typeof body.email !== 'string' ||
    typeof body.password !== 'string' ||
    !body.email.trim() ||
    !body.password
  ) {
    return c.json(
      { error: 'Se requiere email y password' },
      400,
    );
  }

  const email = body.email.trim();

  const supabase = createSupabaseClient({
    SUPABASE_URL: c.env.SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY: c.env.SUPABASE_PUBLISHABLE_KEY,
    SUPABASE_SECRET_KEY: c.env.SUPABASE_SECRET_KEY,
  });

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password: body.password,
  });

  if (error || !data.user || !data.session) {
    return c.json(
      { error: 'Credenciales inválidas' },
      401,
    );
  }

  const admin = createSupabaseAdminClient(c.env);

  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('id, name, email, role, deleted_at')
    .eq('id', data.user.id)
    .maybeSingle();

  if (profileError) {
    return c.json(
      { error: 'No se pudo verificar el perfil' },
      500,
    );
  }

  if (!profile || profile.deleted_at !== null) {
    return c.json(
      { error: 'La cuenta no está habilitada para utilizar la API' },
      403,
    );
  }

  return c.json({
    access_token: data.session.access_token,
    token_type: data.session.token_type,
    expires_in: data.session.expires_in,
    refresh_token: data.session.refresh_token,
    user: {
      id: profile.id,
      name: profile.name,
      email: profile.email,
      role: profile.role,
    },
  });
});


export default app
