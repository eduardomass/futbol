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

## Estructura

```
src/
  components/        Componentes de ReactBits (Aurora, BlurText, SpotlightCard)
  lib/supabase.ts    Cliente de Supabase
  pages/Login.tsx    Pantalla de login
  pages/Inicio.tsx   Pantalla post-login
  types.ts           Tipos compartidos
supabase/migrations/ Migraciones SQL
.claude/skills/      Skill de Claude Code para trabajar la base
.mcp.json            Servidor MCP de Supabase
```

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
