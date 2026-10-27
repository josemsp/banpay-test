
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,

  name text not null
    check (char_length(trim(name)) > 0),

  email text not null unique,

  role text not null
    check (
      role in (
        'admin',
        'films',
        'people',
        'locations',
        'species',
        'vehicles'
      )
    ),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz default null

);

-- Los clientes no podrán consultar ni modificar perfiles directamente.
-- El backend aplicará las reglas de autorización.
alter table public.profiles enable row level security;
