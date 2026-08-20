# Futbol — guía del proyecto

App para administrar los partidos de un grupo de amigos: jugadores, fechas, equipos,
resultados y puntajes cruzados entre jugadores.

- **Producción**: https://futbol2.eduardomass.workers.dev
- **Repo**: https://github.com/eduardomass/futbol
- **Idioma**: todo en español — código, nombres de tablas, funciones, variables y UI.

## Stack

| Capa      | Qué                                                             |
|-----------|-----------------------------------------------------------------|
| Frontend  | Vite + React 19 + TypeScript + Tailwind v4 + react-router-dom    |
| UI        | Componentes de [ReactBits](https://reactbits.dev)                |
| Backend   | Supabase (Postgres 17), ref `dxrsqqkpwhulkgljuaxj`               |
| Deploy    | Cloudflare Worker `futbol2`, automático en cada push a `main`     |

## Comandos

```bash
npm run dev          # servidor de desarrollo en :5173
npm run build        # tsc -b && vite build  ← correr siempre antes de commitear
npm run lint         # oxlint
npm run prueba:e2e   # 47 aserciones contra la base REAL (ver advertencia abajo)
```

## Reglas de arquitectura

### El acceso a datos pasa SIEMPRE por funciones RPC

Todas las tablas tienen RLS activado y **sin policies**. Desde el navegador no se puede
leer ni escribir ninguna tabla: `supabase.from('jugadores').select()` devuelve `[]`.

Todo el acceso pasa por funciones `security definer` que reciben `p_token uuid` y
validan la sesión. El frontend las llama únicamente desde `src/lib/api.ts`.

**Nunca usar `supabase.from(...)` en código de la app.** Si hace falta un dato nuevo, se
agrega una función en una migración.

Al crear una función hay que darle `grant execute ... to anon`, o PostgREST responde 404.

### Autenticación

No se usa Supabase Auth. Hay una tabla `sesiones` con tokens uuid propios que vencen a
los 30 días; el token vive en `localStorage` bajo la clave `futbol.sesion`.

`App.tsx` llama a `sesion_actual()` al montar para refrescar permisos y detectar tokens
vencidos. **Si se agrega algún dato al objeto `Sesion`, hay que devolverlo también desde
`sesion_actual`**, o queda viejo en el navegador para siempre. Ese fue un bug real: al
marcar un jugador como admin, su navegador seguía creyendo que no lo era.

### Administradores

`jugadores.es_admin` marca al admin. Chequear siempre con `sesion_es_admin(p_token)`,
que cubre tanto al jugador con el flag como a una sesión de la tabla `usuarios`.

Existe porque `iniciar_sesion` valida contra `jugadores` **antes** que contra `usuarios`:
quien estaba en las dos tablas nunca conseguía sesión de admin.

### Migraciones

Viven en `supabase/migrations/`, numeradas (`0001_…` … `0006_…`). **Nunca editar una ya
aplicada**: crear una nueva. Aplicarlas con la herramienta MCP `apply_migration`.

El SQL debe ser idempotente donde se pueda: `create table if not exists`,
`create or replace function`, `insert … on conflict`. Cambiar el tipo de retorno de una
función exige `drop function` antes del `create`.

## Cosas que muerden

### La base tiene datos reales

15 jugadores del grupo y fechas jugadas de verdad, con puntajes cargados. **No correr
nada que borre por conteo, por rango de id, o un `delete` sin `where` acotado.** Ya pasó
una vez que una prueba dejó basura mezclada con los datos reales.

### `npm run prueba:e2e` corre contra producción

No hay base de desarrollo. El script crea sus datos con emails `@prueba.local` y los
borra al terminar con `limpiar_datos_prueba`, que solo reconoce ese patrón.

Dos reglas al tocarlo:

1. **Aserciones relativas, nunca absolutas.** Tomar una foto de los conteos al empezar y
   comparar deltas. Un `count === 10` se rompe apenas el usuario carga un jugador.
2. **Todo lo que cree lleva email `@prueba.local`**, único patrón que la limpieza borra.

Y correrlo **una sola vez por comando**: si se pipea a `Select-Object -First N`, el
proceso muere antes de la limpieza y deja los datos de prueba en la base.

### El deploy en Cloudflare

- `.env` **está versionado a propósito** con la Project URL y la publishable key. Son
  públicas por diseño (viajan en el bundle JS). Sin esto el build de Cloudflare compila
  sin credenciales. La `service_role` key nunca va al repo.
- **No agregar `public/_redirects`.** La regla `/* /index.html 200` que se usa en
  Cloudflare Pages es rechazada por el validador de Workers ("Infinite loop detected") y
  rompe el deploy. El fallback para las rutas del cliente ya está resuelto en
  `wrangler.jsonc` con `assets.not_found_handling: "single-page-application"`.
- `.nvmrc` fija Node 22; con el default de Cloudflare (18) Vite 8 no arranca.
- Cada push a `main` dispara build y deploy. Tarda ~1 minuto.

### Los avisos de `get_advisors` son intencionales

Reporta `rls_enabled_no_policy` en todas las tablas y
`*_security_definer_function_executable` en las funciones. Es el diseño, no un problema:
las tablas no deben ser legibles desde el cliente y las funciones son la API pública.
**No "arreglarlos" agregando policies de select** — eso sí abriría los datos.

## Documentación

- `docs/MODELO-DE-DATOS.md` — tablas y catálogo de funciones
- `docs/PENDIENTES.md` — deuda técnica y temas abiertos
- `.claude/skills/supabase-futbol/SKILL.md` — convenciones al tocar la base
