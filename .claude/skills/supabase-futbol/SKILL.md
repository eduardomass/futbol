---
name: supabase-futbol
description: Trabajar con la base de datos Supabase del proyecto Futbol - crear o modificar tablas, escribir y aplicar migraciones SQL, consultar datos, y mantener el login contra la tabla usuarios. Usar siempre que la tarea toque la base, el esquema, RLS, o el archivo supabase/migrations.
---

# Base de datos del proyecto Futbol (Supabase)

## Cómo se conecta

- El servidor MCP `supabase` está declarado en `.mcp.json` (transporte HTTP, OAuth).
- Si las herramientas MCP de Supabase no aparecen, el usuario tiene que autenticarse:
  ejecutar `/mcp` en Claude Code, elegir **supabase** → **Authenticate**.
- El frontend se conecta con la **anon key** desde `.env.local`
  (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`). Nunca poner la `service_role` key
  en el frontend ni commitear `.env.local`.

## Reglas de esquema

- Nombres de tablas y columnas en **minúscula y sin comillas** (Postgres las baja a
  minúscula igual). Español, singular para columnas, plural para tablas: `usuarios`,
  `equipos`, `jugadores`, `partidos`.
- Toda tabla nueva lleva: `id bigint generated always as identity primary key` y
  `created_at timestamptz not null default now()`.
- **RLS activado siempre** (`alter table ... enable row level security`). Si la tabla no
  debe leerse desde el cliente, no crear policy y exponer los datos por una función
  `security definer` con `grant execute ... to anon`.

## Migraciones

- Viven en `supabase/migrations/`, numeradas: `0001_usuarios.sql`, `0002_equipos.sql`, …
- **Nunca editar una migración ya aplicada**: crear una nueva.
- Flujo para aplicar: escribir el archivo `.sql` primero, después aplicarlo con la
  herramienta MCP de Supabase (`apply_migration` / `execute_sql`). Si el MCP no está
  autenticado, indicarle al usuario que pegue el contenido en
  Supabase → **SQL Editor** → New query → Run.
- El SQL debe ser idempotente cuando se pueda: `create table if not exists`,
  `create or replace function`, `insert ... on conflict do update`.

## Estado actual

Proyecto Supabase: ref `dxrsqqkpwhulkgljuaxj` (`https://dxrsqqkpwhulkgljuaxj.supabase.co`),
región us-west-2, Postgres 17. La app usa una **publishable key** (`sb_publishable_…`),
el formato nuevo que reemplaza a la anon key clásica; el rol efectivo sigue siendo `anon`.

Migración `0001_usuarios.sql` **ya aplicada** (nombre en Supabase:
`usuarios_y_validar_login`). Tabla `usuarios`:

| columna      | tipo          | notas                     |
|--------------|---------------|---------------------------|
| `id`         | bigint identity | PK                      |
| `email`      | text          | `not null unique`         |
| `password`   | text          | `not null`, texto plano   |
| `created_at` | timestamptz   | default `now()`           |

RLS activado y **sin policies**, así que la anon key no puede hacer `select` directo.
El login usa la función `public.validar_login(p_email text, p_password text)`
(`security definer`), que devuelve `id, email` sólo si las credenciales coinciden.
Se invoca desde `src/pages/Login.tsx` con `supabase.rpc('validar_login', {...})`.

`get_advisors` reporta tres avisos sobre este diseño — `rls_enabled_no_policy` en
`usuarios` y `*_security_definer_function_executable` en `validar_login`. Los tres son
**intencionales**: la tabla no debe ser legible desde el cliente y la función es
justamente el endpoint público de login. No "arreglarlos" agregando policies de select.

## Deuda técnica conocida

El password está en texto plano porque así se definió el alcance inicial. Si se pide
endurecer el login, las dos opciones en orden de preferencia:

1. Migrar a **Supabase Auth** (`auth.users` + `signInWithPassword`) y dejar `usuarios`
   sólo para datos de perfil, referenciando `auth.uid()`.
2. Mantener la tabla propia pero hashear con `pgcrypto`: guardar
   `crypt(password, gen_salt('bf'))` y comparar dentro de `validar_login` con
   `u.password = crypt(p_password, u.password)`.

No hacer este cambio sin confirmarlo con el usuario: rompe el registro existente.
