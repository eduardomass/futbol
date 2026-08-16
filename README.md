# Futbol

App web con React + Vite + TypeScript + Tailwind, base de datos en Supabase y UI de
[ReactBits](https://reactbits.dev).

## Puesta en marcha

### 1. Base de datos (Supabase)

1. Entrar al proyecto en [supabase.com](https://supabase.com) → **SQL Editor** → *New query*.
2. Pegar el contenido de `supabase/migrations/0001_usuarios.sql` y ejecutar (*Run*).

Eso crea la tabla `usuarios`, activa RLS, inserta el primer registro
(`eduardomass@gmail.com`) y crea la función `validar_login` que usa el login.

### 2. Credenciales

Ya están en `.env`, versionado en el repo. No hay que configurar nada.

Si necesitás pisarlas localmente (por ejemplo para apuntar a otro proyecto de Supabase),
creá un `.env.local` — Vite le da prioridad sobre `.env` y ese sí está en `.gitignore`.

### 3. Correr la app

```bash
npm install
npm run dev
```

Abre en http://localhost:5173. Ingresar con `eduardomass@gmail.com` / `fenixFENIX123`.

## Scripts

| Comando           | Qué hace                          |
|-------------------|-----------------------------------|
| `npm run dev`     | Servidor de desarrollo            |
| `npm run build`   | Chequeo de tipos + build a `dist/` |
| `npm run preview` | Sirve el build de producción      |
| `npm run lint`    | oxlint                            |

## Qué hace

- **Login** de jugadores con email y clave. Los administradores entran con la tabla
  `usuarios`. Un link directo a un partido pide login y después lleva ahí.
- **ABM de jugadores**: alta, edición y baja. Si el jugador ya jugó, la baja lo
  desactiva en vez de borrarlo, para no perder el historial.
- **Partidos**: se crea la fecha (por defecto el próximo jueves), se arman dos equipos
  de 5 sacando y poniendo jugadores, se comienza, se carga el resultado y se finaliza.
- **Puntajes**: con el partido finalizado, cada jugador que participó puntúa a los 10
  —él incluido— del 1 al 10 de a medio punto. Se pueden corregir después.
- **Dashboard**: partidos ganados, promedio general y listado de partidos propios.
- **Detalle de partido**: los dos equipos, el promedio de cada jugador esa fecha y el
  promedio general de la fecha.

## Estructura

```
src/
  components/        Aurora, BlurText, SpotlightCard (ReactBits) + Layout
  lib/supabase.ts    Cliente de Supabase
  lib/api.ts         Todas las llamadas RPC a la base
  lib/session.ts     Token de sesión en localStorage
  lib/formato.ts     Fechas, promedios y etiquetas de estado
  pages/Login.tsx    Login
  pages/Dashboard.tsx  Estadísticas, fechas y «Empezar fecha»
  pages/Jugadores.tsx  ABM de jugadores
  pages/Partido.tsx    Equipos, resultado y carga de puntajes
  types.ts           Tipos compartidos
scripts/             Prueba end-to-end contra la base real
supabase/migrations/ Migraciones SQL
.claude/skills/      Skill de Claude Code para trabajar la base
.mcp.json            Servidor MCP de Supabase
wrangler.jsonc       Config del Worker de Cloudflare
```

## Cómo está armado el acceso a datos

Ninguna tabla es accesible desde el navegador: todas tienen RLS sin policies. Todo pasa
por funciones `security definer` en Postgres que reciben un token de sesión y validan
quién llama. El frontend nunca usa `supabase.from(...)`, solo `supabase.rpc(...)` a
través de `src/lib/api.ts`.

`npm run prueba:e2e` corre 31 aserciones contra la base real ejercitando todo el
circuito, incluidos los casos que deben ser rechazados.

## Agregar componentes de ReactBits

El registry ya está configurado en `components.json`:

```bash
npx shadcn@latest add "@react-bits/NombreDelComponente-TS-TW"
```

Los nombres exactos están en cada página de https://reactbits.dev.

## MCP de Supabase

`.mcp.json` declara el servidor MCP. Para autenticarlo, dentro de Claude Code:
ejecutar `/mcp`, elegir **supabase** → **Authenticate**.

## Deploy en Cloudflare

Desplegado como **Worker** (`futbol2`) con Workers Builds conectado al repo: cada
`git push` a `main` dispara build y deploy automático.

| Campo                  | Valor           |
|------------------------|-----------------|
| Build command          | `npm run build` |
| Build output directory | `dist`          |
| Production branch      | `main`          |

**Variables de entorno**: van versionadas en `.env`, así que el build de Cloudflare las
toma solo y no hay que configurar nada en el dashboard. Ver la sección de seguridad más
abajo sobre por qué es seguro versionarlas.

La versión de Node la fija `.nvmrc` (22).

> **No agregar `public/_redirects`.** La regla `/* /index.html 200` que se usa en
> Cloudflare Pages es rechazada por el validador de Workers ("Infinite loop detected")
> y rompe el deploy. Cuando se agregue un router de cliente, el fallback a `index.html`
> se configura con `assets.not_found_handling: "single-page-application"` en
> `wrangler.jsonc`, no con `_redirects`.

## Nota sobre seguridad

### Por qué `.env` está en el repo

`VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` son públicas por diseño. Vite las
incrusta en el bundle JS que se sirve al navegador, así que cualquier visitante puede
leerlas con F12 — no son un secreto ni pretenden serlo. Lo que protege los datos es RLS
en la base, no la confidencialidad de esa clave.

La **`service_role` key** es otra cosa: saltea RLS por completo. Nunca va en `.env`, ni
en el repo, ni en el frontend.

### Passwords en texto plano

Los passwords se guardan en texto plano en la tabla `usuarios`, según el alcance
inicial. La tabla tiene RLS activo y sin policies, así que no es legible con la anon
key: el login pasa por la función `validar_login` (`security definer`). Para producción
conviene migrar a Supabase Auth o hashear con `pgcrypto` — ver
`.claude/skills/supabase-futbol/SKILL.md`.
