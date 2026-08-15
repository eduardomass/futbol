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

En Supabase: **Project Settings → API**. Copiar *Project URL* y *anon public key* a
`.env.local`:

```
VITE_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOi...
```

`.env.local` está en `.gitignore` — no se sube al repo.

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

## Deploy en Cloudflare Pages

El proyecto se conecta al repo de GitHub y despliega solo en cada `git push`.

Cloudflare Dashboard → **Workers & Pages** → *Create* → pestaña **Pages** →
**Connect to Git** → elegir `eduardomass/futbol`. Configuración del build:

| Campo                  | Valor           |
|------------------------|-----------------|
| Framework preset       | Vite            |
| Build command          | `npm run build` |
| Build output directory | `dist`          |
| Production branch      | `main`          |

**Variables de entorno** (Settings → Environment variables, para *Production* y
*Preview*): hay que cargar `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` a mano.
`.env.local` no se sube al repo, así que sin esto el build de Cloudflare sale sin
credenciales y la app muestra el aviso de configuración faltante.

La versión de Node la fija `.nvmrc` (22) y `public/_redirects` hace el fallback a
`index.html` para que las rutas del cliente no den 404.

## Nota sobre seguridad

Los passwords se guardan en texto plano en la tabla `usuarios`, según el alcance
inicial. La tabla tiene RLS activo y sin policies, así que no es legible con la anon
key: el login pasa por la función `validar_login` (`security definer`). Para producción
conviene migrar a Supabase Auth o hashear con `pgcrypto` — ver
`.claude/skills/supabase-futbol/SKILL.md`.
