# Modelo de datos

Proyecto Supabase `dxrsqqkpwhulkgljuaxj`, Postgres 17, región us-west-2.

Todas las tablas tienen **RLS activado y sin policies**: no son accesibles desde el
navegador. El acceso pasa por las funciones del catálogo de más abajo.

## Tablas

### `usuarios`
Login de administrador, heredado del alcance inicial del proyecto. Hoy el login real
pasa por `jugadores`; esta tabla queda como segunda vía.

| columna      | tipo            | notas               |
|--------------|-----------------|---------------------|
| `id`         | bigint identity | PK                  |
| `email`      | text            | `not null unique`   |
| `password`   | text            | texto plano         |
| `created_at` | timestamptz     | default `now()`     |

### `jugadores`

| columna      | tipo            | notas                                    |
|--------------|-----------------|------------------------------------------|
| `id`         | bigint identity | PK                                       |
| `nombre`     | text            | `not null`                               |
| `apellido`   | text            | `not null`                               |
| `apodo`      | text            | opcional; es lo que se muestra en la UI  |
| `email`      | text            | `not null unique`, usuario de login      |
| `clave`      | text            | `not null`, texto plano                  |
| `activo`     | boolean         | default `true`; la baja lógica lo apaga  |
| `es_admin`   | boolean         | default `false`                          |
| `created_at` | timestamptz     | default `now()`                          |

### `sesiones`
Tokens propios, no se usa Supabase Auth.

| columna      | tipo        | notas                                        |
|--------------|-------------|----------------------------------------------|
| `token`      | uuid        | PK, default `gen_random_uuid()`              |
| `jugador_id` | bigint      | FK `jugadores`, null si es sesión de usuario |
| `usuario_id` | bigint      | FK `usuarios`, null si es sesión de jugador  |
| `creada_en`  | timestamptz | default `now()`                              |
| `expira_en`  | timestamptz | default `now() + 30 días`                    |

`check`: al menos uno de `jugador_id` / `usuario_id` no nulo.

### `partidos`

| columna   | tipo    | notas                                              |
|-----------|---------|----------------------------------------------------|
| `id`      | bigint  | PK                                                 |
| `fecha`   | date    | `not null`                                         |
| `estado`  | text    | `programado` \| `en_curso` \| `finalizado`         |
| `goles_a` | integer | `>= 0`, null hasta que se carga el resultado       |
| `goles_b` | integer | `>= 0`                                             |

### `partido_jugadores`
10 filas por partido: 5 con `equipo = 'A'` y 5 con `'B'`.

| columna      | tipo    | notas                                          |
|--------------|---------|------------------------------------------------|
| `partido_id` | bigint  | FK `partidos`, `on delete cascade`             |
| `jugador_id` | bigint  | FK `jugadores`, `on delete restrict`           |
| `equipo`     | text    | `'A'` o `'B'`                                  |
| `goles`      | integer | `not null default 0`, `>= 0`: los que hizo él  |

`unique (partido_id, jugador_id)`.

El `on delete restrict` es lo que obliga a la baja lógica: un jugador que ya jugó no se
puede borrar sin perder el historial, así que `eliminar_jugador` lo desactiva.

### `puntajes`
Un voto por `(partido, autor, jugador)`. El autor también se puntúa a sí mismo.

| columna      | tipo         | notas                                        |
|--------------|--------------|----------------------------------------------|
| `partido_id` | bigint       | FK `partidos`, `on delete cascade`           |
| `autor_id`   | bigint       | FK `jugadores` — quién opina                 |
| `jugador_id` | bigint       | FK `jugadores` — a quién puntúa              |
| `puntaje`    | numeric(3,1) | de 1 a 10, múltiplos de 0,5                  |

`unique (partido_id, autor_id, jugador_id)`.

## Ciclo de vida del partido

```
programado ──comenzar_partido──> en_curso ──finalizar_partido──> finalizado
   │            (exige 5 y 5)        │      (exige resultado)         │
   │                                 │                               │
 plantel                        resultado                        puntajes
 editable                       editable                         editables
```

Las tres restricciones las hace cumplir Postgres, no la pantalla: no se pueden saltear
desde la consola del navegador.

Los **goles por jugador** (`partido_jugadores.goles`, `guardar_goles`) se cargan desde
que el partido comenzó y siguen editables una vez finalizado: son un hecho del partido,
no un voto que haya que congelar. No tienen que sumar el marcador —un gol en contra
cuenta para el equipo y para ningún goleador—, así que la base no lo valida y la pantalla
solo avisa cuando no cierran.

Un partido se puede borrar en cualquier estado con `eliminar_partido` (solo admin), y se
lleva su plantel y sus puntajes.

Hay un cuarto momento, el **cierre**: cuando se crea un partido con fecha posterior,
`guardar_puntajes` deja de aceptar cargas para el anterior. La planilla de una fecha se
cierra sola al abrirse la siguiente. La grilla del admin sigue abierta, que es la vía
para corregir una carga vieja.

## Catálogo de funciones

Todas son `security definer` con `grant execute to anon` (excepto donde se aclara), y
todas menos `iniciar_sesion` y `proximo_jueves` reciben `p_token uuid` y lo validan.

### Sesión

| función | qué hace |
|---|---|
| `iniciar_sesion(p_email, p_clave)` | Valida contra `jugadores` y después contra `usuarios`. Crea la sesión y devuelve `token, jugador_id, nombre, es_admin`. Cero filas si las credenciales no sirven. |
| `sesion_actual(p_token)` | Estado real del token: `jugador_id, nombre, es_admin`. Cero filas si venció. La usa `App.tsx` al arrancar. |
| `sesion_valida(p_token)` | boolean. Guardia genérica del resto de las funciones. |
| `sesion_es_admin(p_token)` | boolean. Cubre jugador con `es_admin` y sesión de `usuarios`. |
| `jugador_de_token(p_token)` | `jugador_id`, o null si el token no sirve o es sesión de admin puro. |
| `cerrar_sesion(p_token)` | Borra la sesión. |

### Jugadores

| función | qué hace |
|---|---|
| `listar_jugadores(p_token, p_incluir_inactivos)` | Ordenado **por nombre**. Devuelve `es_admin` y `activo`. Abierta a cualquier sesión: se necesita para armar el plantel. |
| `mi_jugador(p_token)` | La fila del jugador de la sesión. Es lo que ve un jugador común en `/jugadores`. Cero filas si el token es de una sesión de `usuarios`. |
| `crear_jugador(p_token, p_nombre, p_apellido, p_apodo, p_email, p_clave, p_es_admin)` | **Solo admin.** Devuelve el id. Error legible si el email está repetido. |
| `actualizar_jugador(p_token, p_id, …, p_clave, p_es_admin)` | `p_clave` y `p_es_admin` en null dejan el valor actual. Un jugador común solo puede editar su propia fila, y su `p_es_admin` se ignora. |
| `eliminar_jugador(p_token, p_id)` | **Solo admin.** Devuelve `'eliminado'` o `'desactivado'` — lo segundo si el jugador ya participó de algún partido. |

### Partidos

| función | qué hace |
|---|---|
| `proximo_jueves()` | Si hoy es jueves devuelve hoy; si no, el jueves siguiente. Único sin token. |
| `crear_partido(p_token, p_fecha)` | `p_fecha` en null usa `proximo_jueves()`. |
| `listar_partidos(p_token)` | Todas las fechas con cantidad de jugadores y promedio. |
| `obtener_partido(p_token, p_partido_id)` | Detalle + `promedio_fecha`, `soy_participante`, `ya_puntue` y `puntajes_cerrados` (true si existe algún partido con fecha posterior). |
| `plantel_partido(p_token, p_partido_id)` | Los 10 con equipo, promedio, cantidad de votos y `goles`. Ordenado por equipo y después **por nombre**. |
| `agregar_jugador_partido(…, p_equipo)` | Solo en `programado`; rechaza el 6º del equipo y los repetidos. |
| `quitar_jugador_partido(…)` | Solo en `programado`. |
| `comenzar_partido(…)` | Exige exactamente 5 y 5. |
| `cargar_resultado(…, p_goles_a, p_goles_b)` | Solo en `en_curso`. Es el marcador de la fecha. |
| `guardar_goles(p_token, p_partido_id, p_goles)` | `p_goles` es `[{jugador_id, goles}]`. Atribuye los goles a cada jugador. Partido en `en_curso` o `finalizado`, cualquier sesión válida. Acepta cargas parciales y reenviar corrige. Devuelve cuántas filas tocó. |
| `finalizar_partido(…)` | Exige resultado cargado. |
| `eliminar_partido(p_token, p_partido_id)` | **Solo admin.** Borra la fecha; el `on delete cascade` se lleva plantel y puntajes. Devuelve `fecha, estado, jugadores, puntajes` de lo que borró. |

### Puntajes

| función | qué hace |
|---|---|
| `guardar_puntajes(p_token, p_partido_id, p_puntajes)` | `p_puntajes` es `[{jugador_id, puntaje}]`. Exige el partido finalizado, que el autor haya jugado, y los 10 jugadores. Reenviar corrige, no duplica. **Se cierra** cuando ya existe un partido con fecha posterior. |
| `mis_puntajes(p_token, p_partido_id)` | Los votos propios, para precargar el formulario. |
| `matriz_puntajes(p_token, p_partido_id)` | **Solo admin.** Todos los votos del partido: `autor_id, jugador_id, puntaje`. |
| `guardar_grilla_puntajes(p_token, p_partido_id, p_celdas)` | **Solo admin.** `[{autor_id, jugador_id, puntaje}]`; `puntaje` en null borra la celda. Acepta cargas parciales. |

### Dashboard

| función | qué hace |
|---|---|
| `estadisticas(p_token)` | `partidos_jugados, ganados, empatados, perdidos, promedio_general` del jugador de la sesión. Una sesión de admin puro devuelve todo en cero. |
| `estadisticas_jugadores(p_token)` | Una fila por jugador con los mismos números. Cuenta solo partidos `finalizado` con resultado cargado. Aparecen los activos más los inactivos con historial. La ve cualquier sesión válida, no solo el admin. |
| `mis_partidos(p_token)` | Los partidos propios con equipo, resultado, promedio personal de esa fecha y `ya_puntue`. Ordenado por fecha desc. |

### Mantenimiento

| función | qué hace |
|---|---|
| `limpiar_datos_prueba(p_token)` | **Solo admin.** Borra jugadores y partidos con email `%@prueba.local`. La usa `scripts/prueba-e2e.mjs`. |
| `validar_login(p_email, p_password)` | **Código muerto.** Login viejo contra `usuarios`, reemplazado por `iniciar_sesion`. Ver `docs/PENDIENTES.md`. |

## Cómo se calculan los promedios

Todos usan `avg(puntaje)` de Postgres sobre las filas que **existen** en `puntajes`. Una
celda vacía no es un cero: no hay fila, así que no entra en el promedio ni en el divisor.

| dónde | qué promedia |
|---|---|
| `plantel_partido.promedio` | Lo que recibió ese jugador en ese partido, dividido por la cantidad de votos que recibió (columna `votos`). |
| `obtener_partido.promedio_fecha` | Todos los votos del partido. |
| `mis_partidos.mi_promedio` | Lo que recibió el jugador en esa fecha. |
| `estadisticas.promedio_general` | Todos los votos que recibió el jugador en toda su historia. |
| `estadisticas_jugadores.promedio_general` | Lo mismo, para cada jugador del grupo. |
| Grilla (fila «Promedio») | Se calcula en el navegador sobre las celdas no vacías de la columna. |
