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

Migraciones aplicadas: `0001_usuarios.sql` y `0002_jugadores_partidos_puntajes.sql`.

### Tablas

| tabla               | para qué                                                        |
|---------------------|-----------------------------------------------------------------|
| `usuarios`          | login de administrador (heredada del alcance inicial)           |
| `jugadores`         | `id, nombre, apellido, apodo, email, clave, activo`             |
| `sesiones`          | token uuid → `jugador_id` o `usuario_id`, vence a los 30 días   |
| `partidos`          | `fecha`, `estado`, `goles_a`, `goles_b`                         |
| `partido_jugadores` | 10 filas por partido, 5 con `equipo = 'A'` y 5 con `'B'`        |
| `puntajes`          | un voto por `(partido, autor, jugador)`, escala 1–10 de a 0,5   |

Ciclo de vida del partido: `programado` → `en_curso` → `finalizado`. El plantel solo se
edita en `programado`; el resultado solo en `en_curso`; los puntajes solo en
`finalizado` y solo por quienes jugaron.

### Cómo se accede

**Ninguna tabla es accesible desde el cliente.** Todas tienen RLS sin policies. Todo
pasa por funciones `security definer` que reciben `p_token uuid` y validan la sesión
con `sesion_valida()` / `jugador_de_token()`. El frontend las llama desde
`src/lib/api.ts`; no usar `supabase.from(...)` en ningún lado.

Al agregar una función nueva hay que darle `grant execute ... to anon` (ver el bloque
`do $blk$` al final de la migración 0002) o el frontend recibe un 404 de PostgREST.

`get_advisors` reporta `rls_enabled_no_policy` y
`*_security_definer_function_executable` para todo esto. Son **intencionales**: las
tablas no deben ser legibles desde el cliente y las funciones son la API pública. No
"arreglarlos" agregando policies de select.

### Prueba de regresión

`npm run prueba:e2e` ejerce las 22 funciones con supabase-js contra la base real
(31 aserciones, incluidos los casos que deben fallar). Deja datos de prueba; el
encabezado del script trae el SQL para limpiarlos.

## Deuda técnica conocida

**Passwords en texto plano** (`usuarios.password` y `jugadores.clave`), porque así se
definió el alcance inicial. Si se pide endurecer:

1. Migrar a **Supabase Auth** (`auth.users` + `signInWithPassword`) y dejar `jugadores`
   solo con datos de perfil, referenciando `auth.uid()`. Elimina de paso la tabla
   `sesiones` y el token propio.
2. Mantener las tablas propias pero hashear con `pgcrypto`: guardar
   `crypt(clave, gen_salt('bf'))` y comparar con `clave = crypt(p_clave, clave)`.

No hacer el cambio sin confirmarlo: rompe los registros existentes.

**El token de sesión es la única defensa.** Cualquiera con un token válido puede llamar
a todas las funciones, incluido el ABM de jugadores y el manejo de partidos. No hay
distinción de permisos entre un jugador común y el admin, y `iniciar_sesion` no tiene
rate limiting contra fuerza bruta. Alcanza para un grupo de amigos; no para algo
público.
