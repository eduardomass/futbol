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
npm run prueba:e2e   # 105 aserciones contra la base REAL (ver advertencia abajo)
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

Qué puede cada uno (migración `0007`, validado en la base, no solo en la pantalla):

| | admin | jugador común |
|---|---|---|
| Alta y baja de jugadores | sí | no |
| Editar datos de otro jugador | sí | no, solo los propios |
| Cambiar el flag `es_admin` | sí | no — se ignora lo que manda el cliente |
| Grilla de puntajes de una fecha | sí | no |
| Corregir el marcador en cualquier estado | sí | no |
| Reabrir una fecha (un estado atrás) | sí | no |

Un jugador común ve en `/jugadores` solo su ficha, que trae `mi_jugador(p_token)`.
`listar_jugadores` sigue abierta a todos porque se necesita para armar el plantel.

### Los goles por jugador arman el resultado

`partido_jugadores.goles` dice cuántos hizo cada uno, y `guardar_goles` **recalcula**
`partidos.goles_a` / `goles_b` con la suma de cada equipo. Cargar los goles de los
jugadores es la forma normal de cargar el resultado; `cargar_resultado` queda como la
vía manual.

Dos detalles que importan:

- **Todo en cero no toca el resultado.** Un plantel sin goles cargados no es un 0-0 sino
  «todavía no lo cargué», así que `guardar_goles` deja el marcador como estaba. Un 0-0
  real se carga con `cargar_resultado`.
- **La suma es del plantel completo**, no de lo que llegó en el array. `guardar_goles`
  acepta cargas parciales, y aun así el marcador sale de los 10.

Se cargan con el partido en `en_curso` o `finalizado`, desde cualquier sesión válida, y
sin el cierre por fecha posterior que tienen los puntajes: un gol es un hecho del
partido, no un voto. Ojo con la contracara: al ser el marcador la suma de los goleadores,
**no hay lugar para un gol en contra** — si aparece, hay que corregir el marcador después
de guardar los goles.

Para eso está `corregir_resultado(p_token, p_partido_id, p_goles_a, p_goles_b)`
(migración `0014`, **solo admin**): cambia el marcador **en cualquier estado**, incluso con
la fecha finalizada, que es donde `cargar_resultado` ya no acepta. Mismo criterio que
`guardar_grilla_puntajes` frente a `guardar_puntajes`: la función del ciclo de vida respeta
el ciclo de vida, y el admin tiene una puerta aparte para corregir.

**El orden importa**: `guardar_goles` recalcula el marcador, así que una corrección a mano
se pierde si después alguien guarda los goles de esa misma fecha. Primero los goles,
después la corrección. La pantalla lo avisa.

### El ciclo de vida también va para atrás

`programado` → `en_curso` → `finalizado` solo iba para adelante, y una fecha finalizada
por error no tenía arreglo desde la app: el resultado ya no se carga, el plantel ya no se
edita, y la fecha entra en las estadísticas como jugada. La única salida era un `update` a
mano, o borrarla con `eliminar_partido` y perder plantel y puntajes. Pasó de verdad con la
fecha del 3/9/2026.

`reabrir_partido(p_token, p_partido_id)` (migración `0015`, **solo admin**) es la vuelta
atrás, **un estado por llamada**: `finalizado` → `en_curso` para volver a tocar el
resultado, `en_curso` → `programado` para volver a armar los equipos. Devuelve
`estado_anterior` y `estado_nuevo`; con la fecha ya en `programado` falla, porque no hay
estado anterior. Un paso y no dos a propósito: en `programado` el plantel se puede editar,
y quitar a un jugador borra la fila con los goles que tenía.

No borra nada —marcador, plantel, goles y puntajes quedan donde están, así que
`finalizar_partido` vuelve a aceptar sin recargar—, pero mientras la fecha esté reabierta
`guardar_puntajes` no acepta cargas nuevas y la fecha **sale de las estadísticas**, que
solo cuentan partidos finalizados. El botón está en la pantalla de la fecha y avisa las dos
cosas antes de confirmar.

### Jugador del partido: se cuenta por planilla, no por promedio

`plantel_partido` devuelve `mejores` y `peores`: cuántas planillas de esa fecha pusieron
al jugador como su puntaje **más alto** y como su **más bajo**. El que más `mejores`
junta es el jugador del partido; el que más `peores`, el peor. La elección la hace la
pantalla (`Partido.tsx`, memo `destacados`), que ya tiene el plantel entero.

Dos reglas del conteo, en la migración `0012`:

- **Un empate dentro de una planilla cuenta para todos los empatados.** Si un autor puso
  8 como máximo y se lo dio a tres, los tres se llevan un `mejores`.
- **Una planilla plana no elige a nadie.** Si un autor puntuó igual a los diez, su máximo
  es también su mínimo: no está diciendo quién fue el mejor. El `having max > min` la
  descarta. Sin eso, los diez se llevaban un `mejores` y un `peores` de esa planilla.

Los empates en el total también se muestran completos: con diez votantes, empatar en dos
o tres es lo normal.

**En el historial** (`estadisticas_jugadores`, migración `0013`) esos títulos se acumulan en
`mvp` y `wvp`: en cuántas fechas fue el jugador y el peor del partido. Se **comparten** en
caso de empate, así que la suma de la columna puede pasar la cantidad de fechas jugadas —
la pantalla lo aclara al pie. Una fecha con todas las planillas planas no reparte título.

### Los puntajes se cierran con la fecha siguiente

`guardar_puntajes` rechaza la carga si existe **cualquier** partido con fecha posterior:
pasada la fecha siguiente, nadie retoca los puntajes de la anterior. `obtener_partido`
devuelve `puntajes_cerrados` para que la pantalla lo explique antes de dejar apretar.

La grilla del admin (`guardar_grilla_puntajes`) **no** tiene ese límite a propósito: es
la vía para corregir una carga vieja.

Y si la fecha posterior se creó de más, `eliminar_partido(p_token, p_partido_id)` la
borra —solo admin, con el `on delete cascade` llevándose plantel y puntajes— y los
puntajes de la anterior se reabren solos.

Ojo con `scripts/prueba-e2e.mjs`: su partido de prueba tiene que ser el de fecha más
alta, o el paso de puntajes falla. El script ya lo resuelve mirando `listar_partidos`
antes de crearlo.

### La exportación a Excel se arma en el navegador

La pantalla `/partidos` tiene un panel para bajarse un `.xlsx` con **cómo fueron los
equipos en cada fecha**: se eligen qué fechas entran y qué columnas se llevan (goles,
promedio y votos, destacados, y una hoja resumen con una fila por fecha).

Los datos salen de una sola llamada: `exportar_planteles(p_token, p_partido_ids)`
(migración `0016`) devuelve una fila por (fecha, jugador) con marcador, equipo, goles,
promedio, votos, `mejores` / `peores`, el `resultado` del equipo del jugador y
`es_mvp` / `es_wvp`. Es `plantel_partido` para muchas fechas de una: con la función
de a una, exportar 40 fechas serían 40 llamadas desde el navegador. Con la lista vacía
—o en null— trae todas. Pide solo sesión válida, como `plantel_partido`: la planilla
autor × jugador sigue siendo del admin.

El archivo se arma en el cliente con `write-excel-file` (`src/lib/exportar.ts`), que
entra con un `import()` dinámico: son ~70 kB que no tienen por qué viajar en el bundle
de todos los que nunca exportan.

Dos detalles del formato:

- **La fecha va como fecha de Excel**, no como texto, y el `Date` se arma con
  `Date.UTC`. La librería saca el serial de `getTime()`, así que con un `Date` local
  la planilla muestra el día anterior en cualquier huso al este de Greenwich.
- **Los `numeric` de Postgres llegan como string** por PostgREST. Los promedios pasan
  por `aNumero()` antes de ir a una celda numérica, o Excel los guarda como texto y no
  se pueden promediar en la planilla.

### Migraciones

Viven en `supabase/migrations/`, numeradas (`0001_…` … `0016_…`). **Nunca editar una ya
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
