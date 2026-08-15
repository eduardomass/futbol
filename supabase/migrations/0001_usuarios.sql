-- =============================================================
-- Proyecto Futbol · Tabla inicial de Usuarios + login
-- Ejecutar en Supabase → SQL Editor → New query → Run
-- =============================================================

-- 1. Tabla Usuarios (Id, email, Password)
create table if not exists public.usuarios (
  id         bigint generated always as identity primary key,
  email      text not null unique,
  password   text not null,
  created_at timestamptz not null default now()
);

-- 2. RLS activado y SIN políticas públicas:
--    con la anon key nadie puede hacer SELECT sobre la tabla,
--    así el listado de usuarios y sus passwords no queda expuesto.
alter table public.usuarios enable row level security;

-- 3. Primer registro
insert into public.usuarios (email, password)
values ('eduardomass@gmail.com', 'fenixFENIX123')
on conflict (email) do update set password = excluded.password;

-- 4. Función de login.
--    SECURITY DEFINER = corre con los permisos del dueño de la tabla,
--    por eso puede consultar usuarios aunque RLS bloquee al rol anon.
--    Devuelve la fila sólo si email + password coinciden.
create or replace function public.validar_login(p_email text, p_password text)
returns table (id bigint, email text)
language sql
security definer
set search_path = public
as $$
  select u.id, u.email
  from public.usuarios u
  where lower(u.email) = lower(trim(p_email))
    and u.password = p_password;
$$;

revoke all on function public.validar_login(text, text) from public;
grant execute on function public.validar_login(text, text) to anon, authenticated;
