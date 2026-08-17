# Pendientes y temas abiertos

Estado al 17/08/2026.

## Abierto sin resolver

### Los promedios: reporte de que dividen por 10

El usuario reportó: *«Los promedios los hace siempre dividido 10 pero los debería hacer
por cantidad de personas que opinaron»*. **Quedó sin resolver**, la investigación se
interrumpió a mitad de camino.

Lo que se verificó hasta ahora:

- En la base, todos los promedios usan `avg(puntaje)` sobre las filas existentes de
  `puntajes`. Postgres divide por la cantidad de filas, no por 10. Una celda vacía no
  genera fila, así que no infla el divisor.
- En la fecha 13/08 solo opinó una persona, y los promedios por jugador dan 6.00, 5.00,
  etc. con `votos = 1`. Ahí divide por 1, no por 10.
- En la fecha 06/08 opinaron 10 personas y cada jugador puntuado recibió 10 votos, así
  que dividir por 10 **es** dividir por la cantidad de opiniones. Los números coinciden
  en los dos criterios y no permiten distinguirlos.
- El promedio de columna de la grilla (`GrillaPuntajes.tsx`, `promedioColumna`) filtra
  las celdas vacías antes de promediar.
- Se buscaron divisiones literales por 10 o por `plantel.length` en `src/`: no hay.

Un dato que puede estar detrás del reporte: en la fecha del **06/08 hay dos jugadores
del plantel que no recibieron ningún voto** — Ezequiel Galansky y Gaston Levy. Los 10
autores puntuaron solo a 8 de los 10. Eso es posible porque `guardar_grilla_puntajes`
acepta cargas parciales a propósito. Sus promedios se muestran como «—».

**Próximo paso**: pedirle al usuario la pantalla exacta y el número que ve mal, contra
qué número esperaba. Sin eso no se puede reproducir. Candidato a revisar primero:
`estadisticas.promedio_general`, que promedia todos los votos recibidos en la historia
(divisor = cantidad de votos). Si lo que se espera es el promedio de los promedios por
fecha, el número da distinto — para Eduardo, 5.27 contra 5.60 — y ahí puede estar la
discrepancia real, aunque no sea literalmente «dividido 10».

## Bugs conocidos

### `Number('')` convierte el «—» en 0 en el formulario de puntajes

En `src/pages/Partido.tsx`, el `<select>` de puntaje tiene una opción vacía con
`value=""`, y el handler hace `Number(e.target.value)`. `Number('')` es `0`.

Consecuencia: si el usuario elige un puntaje y después vuelve a «—», se guarda un `0` en
el estado. Ese `0` cuenta como celda completa, habilita el botón «Guardar puntajes», y
al enviar la base lo rechaza por el `check (puntaje >= 1)`. El usuario ve un error de
Postgres en vez de un aviso claro.

Arreglo: tratar el string vacío como "sin valor" (borrar la clave del objeto en vez de
guardar `Number('')`).

### `validar_login` quedó como código muerto

La función del login original contra `usuarios` sigue existiendo y ejecutable por `anon`,
pero ya nadie la llama: la reemplazó `iniciar_sesion`. Conviene borrarla en una migración
para no dejar superficie de ataque sin uso.

## Deuda técnica

### Passwords en texto plano

`usuarios.password` y `jugadores.clave` guardan la contraseña sin hashear, porque así se
definió el alcance inicial. Las tablas no son legibles desde el cliente (RLS sin
policies), así que no están expuestas por la API, pero cualquiera con acceso a la base
las ve.

Dos caminos, en orden de preferencia:

1. Migrar a **Supabase Auth** (`auth.users` + `signInWithPassword`) y dejar `jugadores`
   solo con datos de perfil, referenciando `auth.uid()`. Elimina de paso la tabla
   `sesiones` y el token propio.
2. Mantener las tablas propias y hashear con `pgcrypto`: guardar
   `crypt(clave, gen_salt('bf'))` y comparar con `clave = crypt(p_clave, clave)`.

Cualquiera de los dos rompe los registros existentes: hay que coordinarlo con el usuario
y resetear las claves de los 15 jugadores.

### El token de sesión es la única defensa

Cualquiera con un token válido puede llamar a casi todas las funciones: crear y borrar
jugadores, crear fechas, cargar resultados. La única distinción de permisos que existe
es `es_admin`, y solo la usan `matriz_puntajes`, `guardar_grilla_puntajes` y
`limpiar_datos_prueba`.

Además `iniciar_sesion` no tiene rate limiting: se puede hacer fuerza bruta sobre las
claves sin ningún freno.

Alcanza para un grupo de amigos. No alcanza si la app se abre a desconocidos.

### Emails de jugadores sin validar

Varios jugadores quedaron cargados con emails que no son emails (`m`, `s`, `l`, `nico`,
`joni`, `pezegala@`, `soberbiardie`). El campo es el usuario de login, así que funciona,
pero conviene decidir si se valida el formato o si se cambia a un campo «usuario» y el
email pasa a ser opcional.

### Bundle de 647 kB

Vite avisa que el chunk pasa los 500 kB. Lo pesado es `ogl` (el fondo animado Aurora del
login) más `motion`. Si molesta el tiempo de carga, la salida es cargar `Aurora` con
`lazy()` para que no entre en el bundle inicial.

## Ideas pedidas o insinuadas, no implementadas

- **Navegación tipo Excel en la grilla**: moverse con Tab y flechas, y algo tipo «copiar
  la fila de arriba». Se ofreció y no se cerró.
- **Equipos automáticos**: hoy la asignación al equipo A o B es manual. Se descartó
  armarlos al azar, pero podría volver como opción.
- **Puntajes propios del jugador**: cada uno carga los suyos por su link. Funciona, pero
  nadie del grupo lo usó todavía: las dos fechas se cargaron desde la grilla de admin.
