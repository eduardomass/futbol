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

Migraciones aplicadas: `0001` … `0014`.

**La base tiene datos reales**: los jugadores del grupo y sus fechas jugadas. No correr
scripts que borren por conteo o por rango de id.

### Tablas

| tabla               | para qué                                                          |
|---------------------|-------------------------------------------------------------------|
| `usuarios`          | login de administrador (heredada del alcance inicial)             |
| `jugadores`         | `id, nombre, apellido, apodo, email, clave, activo, es_admin`     |
| `sesiones`          | token uuid → `jugador_id` o `usuario_id`, vence a los 30 días     |
| `partidos`          | `fecha`, `estado`, `goles_a`, `goles_b`                           |
| `partido_jugadores` | 10 filas por partido, 5 con `equipo = 'A'` y 5 con `'B'`, `goles` |
| `puntajes`          | un voto por `(partido, autor, jugador)`, escala 1–10 de a 0,5     |

### Administradores

`jugadores.es_admin` marca a un jugador como admin. Existe porque `iniciar_sesion`
valida contra `jugadores` antes que contra `usuarios`: quien estaba en las dos tablas
nunca conseguía sesión de admin. Chequear siempre con `sesion_es_admin(p_token)`, que
cubre los dos casos (jugador con el flag, o sesión de `usuarios`).

El admin habilita `matriz_puntajes` y `guardar_grilla_puntajes` (la planilla autor ×
jugador de una fecha) y, desde la migración `0007`, el ABM de jugadores:

- `crear_jugador` y `eliminar_jugador`: solo admin.
- `actualizar_jugador`: un jugador común solo puede editar su propia fila, y el flag
  `es_admin` se ignora si no lo manda un admin (antes cualquiera se marcaba admin a sí
  mismo y se quedaba con la grilla de todos).
- `mi_jugador(p_token)`: la fila propia, para la pantalla del jugador común.
- `listar_jugadores` sigue abierta a todos: se necesita para armar el plantel.

### Cierre de puntajes

`guardar_puntajes` rechaza la carga si existe algún partido con fecha posterior — la
planilla de una fecha se cierra cuando se carga la siguiente. `obtener_partido` devuelve
`puntajes_cerrados` para que la pantalla lo avise. `guardar_grilla_puntajes` **no** tiene
ese límite: es la vía del admin para corregir una fecha vieja.

`eliminar_partido(p_token, p_partido_id)` (migración `0008`, solo admin) borra una fecha
entera: el cascade se lleva plantel y puntajes. Es la salida cuando se creó una fecha
posterior de más y dejó cerrados los puntajes de la anterior.

### Goles por jugador

`partido_jugadores.goles` (migración `0010`, default 0) guarda cuántos goles hizo cada
uno, y `plantel_partido` devuelve la columna.

`guardar_goles(p_token, p_partido_id, p_goles jsonb)` acepta `[{jugador_id, goles}]`,
admite cargas parciales y se puede reenviar para corregir. Pide sesión válida y partido
en `en_curso` o `finalizado` — sin restricción de admin ni cierre por fecha posterior:
un gol es un hecho del partido, no un voto.

Desde la migración `0011` **recalcula el marcador**: `partidos.goles_a` / `goles_b`
quedan con la suma de cada equipo, tomada del plantel completo y no solo de lo que llegó
en el array. La excepción es la carga toda en cero, que deja el resultado intacto: un
plantel en cero es «no cargué nada», no un 0-0. Contracara: el marcador es la suma de
los goleadores, así que un gol en contra no se puede representar — se corrige con
`cargar_resultado` después.

### Mejor y peor puntaje de cada planilla

`plantel_partido` devuelve `mejores` y `peores` (migración `0012`): cuántas planillas
de la fecha pusieron al jugador como su puntaje más alto y como su más bajo. El jugador
del partido es el de más `mejores`, el peor el de más `peores`, y esa elección la hace
la pantalla.

Un empate dentro de una planilla cuenta para todos los empatados. Y una planilla plana
—el mismo puntaje para los diez— no elige a nadie: el `having max > min` la descarta,
porque si no los diez jugadores se llevaban un `mejores` y un `peores` de esa planilla.

`estadisticas_jugadores` acumula esos títulos en `mvp` y `wvp` (migración `0013`): en
cuántas fechas fue el jugador y el peor del partido. Se **comparten** en caso de empate al
tope de la fecha, así que la suma de cada columna puede pasar la cantidad de fechas.

### Orden de los listados

`listar_jugadores` y `plantel_partido` ordenan **por nombre**, no por apellido — es lo
que pidió el usuario para la pantalla de armado de partidos.

Ciclo de vida del partido: `programado` → `en_curso` → `finalizado`. El plantel solo se
edita en `programado`; el resultado solo en `en_curso`; los puntajes solo en
`finalizado` y solo por quienes jugaron.

La excepción del resultado es `corregir_resultado` (migración `0014`, **solo admin**): pisa
el marcador en cualquier estado, para arreglar una fecha ya finalizada. Ojo el orden con
`guardar_goles`, que recalcula el marcador y se lleva la corrección puesta.

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

`npm run prueba:e2e` ejerce las funciones con supabase-js contra la base real
(89 aserciones, incluidos los casos que deben ser rechazados). Al terminar limpia lo
suyo con `limpiar_datos_prueba`, que solo borra filas con email `%@prueba.local`.

Dos reglas al tocar ese script, porque corre sobre datos reales:

1. **Aserciones relativas, nunca absolutas.** Tomar una foto de los conteos al empezar
   y comparar deltas. Un `count === 10` se rompe apenas el usuario carga un jugador.
2. **Todo lo que cree tiene que llevar email `@prueba.local`**, que es el único patrón
   que la limpieza reconoce. Un partido se borra si participó algún jugador de prueba:
   un partido vacío queda como basura en los datos reales.
3. El partido de prueba tiene que ser el de **fecha más alta** o `guardar_puntajes` lo
   rechaza por el cierre de puntajes. El script lo resuelve mirando `listar_partidos`
   antes de crearlo.

## Deuda técnica conocida

**Passwords en texto plano** (`usuarios.password` y `jugadores.clave`), porque así se
definió el alcance inicial. Si se pide endurecer:

1. Migrar a **Supabase Auth** (`auth.users` + `signInWithPassword`) y dejar `jugadores`
   solo con datos de perfil, referenciando `auth.uid()`. Elimina de paso la tabla
   `sesiones` y el token propio.
2. Mantener las tablas propias pero hashear con `pgcrypto`: guardar
   `crypt(clave, gen_salt('bf'))` y comparar con `clave = crypt(p_clave, clave)`.

No hacer el cambio sin confirmarlo: rompe los registros existentes.

**El token de sesión es la única defensa.** El ABM de jugadores y la grilla ya piden
admin (migraciones `0003` y `0007`), pero el manejo de partidos —crear fechas, armar
planteles, cargar resultados— lo puede hacer cualquier jugador con token válido, y
`iniciar_sesion` no tiene rate limiting contra fuerza bruta. Alcanza para un grupo de
amigos; no para algo público.
