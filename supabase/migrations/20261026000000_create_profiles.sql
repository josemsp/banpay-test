create table public.profiles (
  id uuid primary key,
  name text not null
    check (char_length(trim(name)) > 0),
  email text not null,
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

-- updated_at auto-update
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

-- Indexes for active users
create index if not exists profiles_active_created_at_idx
  on public.profiles (created_at desc)
  where deleted_at is null;

create index if not exists profiles_active_role_idx
  on public.profiles (role)
  where deleted_at is null;

-- Email unique only among active users
create unique index if not exists profiles_email_active_key
  on public.profiles (email)
  where deleted_at is null;

create index if not exists profiles_email_idx
  on public.profiles (email);

-- FK without cascade so profile remains after auth user is deleted
-- alter table public.profiles
--   drop constraint if exists profiles_id_fkey;

-- alter table public.profiles
--   add constraint profiles_id_fkey
--     foreign key (id)
--     references auth.users(id)
--     on delete no action;
