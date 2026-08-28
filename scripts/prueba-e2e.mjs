// Prueba end-to-end de las RPC tal como las llama el frontend:
// mismo cliente supabase-js, misma publishable key, misma base.
//
//   npm run prueba:e2e
//
// OJO: corre contra la base REAL. Crea 9 jugadores `@prueba.local` y un
// partido, y al terminar los borra con `limpiar_datos_prueba` (que solo
// toca ese dominio de email, nunca datos reales).
//
// Las aserciones son RELATIVAS a lo que ya haya en la base: la base tiene
// jugadores y fechas de verdad, así que comparar contra números fijos
// daría falsos negativos.
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const env = Object.fromEntries(
  readFileSync('.env', 'utf8')
    .split('\n')
    .filter(l => l.includes('=') && !l.trim().startsWith('#'))
    .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
)

const sb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY)

let fallos = 0
function ok(cond, msg) {
  console.log(`${cond ? '  OK  ' : ' FALLA'} ${msg}`)
  if (!cond) fallos++
}

async function rpc(fn, args) {
  const { data, error } = await sb.rpc(fn, args)
  if (error) throw new Error(`${fn}: ${error.message}`)
  return data
}

function sumarDias(fecha, dias) {
  const d = new Date(fecha + 'T00:00:00')
  d.setDate(d.getDate() + dias)
  return d.toISOString().slice(0, 10)
}

async function debeFallar(fn, args, etiqueta) {
  const { error } = await sb.rpc(fn, args)
  ok(!!error, `${etiqueta} → rechazado: ${error?.message ?? 'NO FALLÓ'}`)
}

// Nombres a propósito en orden alfabético inverso al de los apellidos,
// para poder comprobar que los listados ordenan por NOMBRE.
const NOMBRES = ['Ana', 'Bruno', 'Carlos', 'Diego', 'Elena', 'Franco', 'Gabriel', 'Hugo', 'Ivan']
const APELLIDOS = ['Zurita', 'Yanez', 'Ximenez', 'Wolf', 'Vega', 'Ulloa', 'Torres', 'Sosa', 'Rivas']

const creados = []
let partidoId = null
let token = null

try {
  // ============ login ============
  const login = await rpc('iniciar_sesion', {
    p_email: 'eduardomass@gmail.com',
    p_clave: 'fenixFENIX123',
  })
  ok(login.length === 1, 'iniciar_sesion devuelve la sesión')
  token = login[0].token
  const yoId = login[0].jugador_id
  ok(!!token && !!yoId, `token y jugador_id (${yoId})`)
  ok(login[0].es_admin === true, 'el jugador semilla viene marcado como administrador')

  const malo = await rpc('iniciar_sesion', {
    p_email: 'eduardomass@gmail.com',
    p_clave: 'claveIncorrecta',
  })
  ok(malo.length === 0, 'clave incorrecta no devuelve sesión')

  // sesion_actual: el frontend la usa al arrancar para refrescar lo guardado
  // en localStorage, que puede tener permisos viejos o un token vencido.
  const actual = await rpc('sesion_actual', { p_token: token })
  ok(
    actual.length === 1 && actual[0].es_admin === true && actual[0].jugador_id === yoId,
    'sesion_actual devuelve los permisos frescos del token',
  )
  const actualMala = await rpc('sesion_actual', {
    p_token: '00000000-0000-0000-0000-000000000000',
  })
  ok(actualMala.length === 0, 'sesion_actual con token inválido devuelve vacío')

  // Fotos del estado previo: todo lo que sigue se compara contra esto.
  const baseJugadores = (await rpc('listar_jugadores', {
    p_token: token,
    p_incluir_inactivos: false,
  })).length
  const [baseStats] = await rpc('estadisticas', { p_token: token })
  const baseTabla = await rpc('estadisticas_jugadores', { p_token: token })
  const baseMia = baseTabla.find(f => f.jugador_id === yoId)
  console.log(`  ···  base: ${baseJugadores} jugadores, ${baseStats.partidos_jugados} partidos jugados`)

  // ============ ABM de jugadores ============
  for (let i = 0; i < 9; i++) {
    creados.push(
      await rpc('crear_jugador', {
        p_token: token,
        p_nombre: NOMBRES[i],
        p_apellido: APELLIDOS[i],
        p_apodo: NOMBRES[i].slice(0, 3).toLowerCase(),
        p_email: `e2e${i + 1}@prueba.local`,
        p_clave: 'clave-e2e',
        p_es_admin: false,
      }),
    )
  }
  ok(creados.length === 9, 'crear_jugador x9')

  const lista = await rpc('listar_jugadores', { p_token: token, p_incluir_inactivos: false })
  ok(
    lista.length === baseJugadores + 9,
    `listar_jugadores suma los 9 nuevos (${baseJugadores} → ${lista.length})`,
  )

  const nombres = lista.map(j => j.nombre)
  const ordenados = [...nombres].sort((a, b) => a.localeCompare(b, 'es'))
  ok(
    JSON.stringify(nombres) === JSON.stringify(ordenados),
    `listar_jugadores ordena por nombre → ${nombres.slice(0, 6).join(', ')}…`,
  )
  ok(
    creados.every(id => lista.find(j => j.id === id)?.es_admin === false),
    'listar_jugadores expone es_admin y los creados no son admin',
  )

  await rpc('actualizar_jugador', {
    p_token: token,
    p_id: creados[0],
    p_nombre: 'Ana',
    p_apellido: 'Zurita',
    p_apodo: 'anita',
    p_email: 'e2e1@prueba.local',
    p_clave: null,
    p_es_admin: null,
  })
  const trasEditar = await rpc('listar_jugadores', { p_token: token, p_incluir_inactivos: false })
  ok(
    trasEditar.find(j => j.id === creados[0])?.apodo === 'anita',
    'actualizar_jugador edita sin tocar clave ni es_admin cuando van en null',
  )

  await debeFallar(
    'crear_jugador',
    {
      p_token: token,
      p_nombre: 'Dup',
      p_apellido: 'Dup',
      p_apodo: null,
      p_email: 'e2e1@prueba.local',
      p_clave: 'x',
      p_es_admin: false,
    },
    'email duplicado',
  )
  await debeFallar(
    'listar_jugadores',
    { p_token: '00000000-0000-0000-0000-000000000000', p_incluir_inactivos: false },
    'token inválido',
  )

  // ============ partido ============
  const jueves = await rpc('proximo_jueves')
  ok(new Date(jueves + 'T00:00:00').getDay() === 4, `proximo_jueves() cae jueves (${jueves})`)

  // `guardar_puntajes` se cierra cuando hay una fecha posterior cargada, así
  // que el partido de prueba tiene que ser el último. El próximo jueves suele
  // alcanzar; si la base ya tiene algo más adelante, se crea después de eso.
  const fechasPrevias = await rpc('listar_partidos', { p_token: token })
  const ultimaFecha = fechasPrevias.reduce((m, p) => (p.fecha > m ? p.fecha : m), '')
  const usarDefecto = ultimaFecha <= jueves

  partidoId = await rpc('crear_partido', {
    p_token: token,
    p_fecha: usarDefecto ? null : sumarDias(ultimaFecha, 7),
  })
  const [det0] = await rpc('obtener_partido', { p_token: token, p_partido_id: partidoId })
  if (usarDefecto) {
    ok(det0.fecha === jueves, 'crear_partido sin fecha usa el próximo jueves')
  } else {
    console.log(
      `  ···  la base ya tiene fechas después del ${jueves}: el partido de prueba va al ${det0.fecha} y esta corrida NO prueba el default de crear_partido`,
    )
  }
  ok(det0.estado === 'programado', 'nace en estado programado')

  const todos = [yoId, ...creados]
  for (let i = 0; i < 10; i++) {
    await rpc('agregar_jugador_partido', {
      p_token: token,
      p_partido_id: partidoId,
      p_jugador_id: todos[i],
      p_equipo: i < 5 ? 'A' : 'B',
    })
  }
  let plantel = await rpc('plantel_partido', { p_token: token, p_partido_id: partidoId })
  ok(plantel.length === 10, 'plantel de 10')
  ok(plantel.filter(p => p.equipo === 'A').length === 5, '5 en el equipo A')
  ok(plantel.every(p => p.goles === 0), 'los goles de cada jugador arrancan en 0')

  const nombresA = plantel.filter(p => p.equipo === 'A').map(p => p.nombre)
  ok(
    JSON.stringify(nombresA) === JSON.stringify([...nombresA].sort((a, b) => a.localeCompare(b, 'es'))),
    `plantel_partido ordena por nombre dentro del equipo → ${nombresA.join(', ')}`,
  )

  await rpc('quitar_jugador_partido', {
    p_token: token,
    p_partido_id: partidoId,
    p_jugador_id: todos[9],
  })
  plantel = await rpc('plantel_partido', { p_token: token, p_partido_id: partidoId })
  ok(plantel.length === 9, 'quitar_jugador_partido saca al jugador')

  await debeFallar(
    'comenzar_partido',
    { p_token: token, p_partido_id: partidoId },
    'comenzar con 9 jugadores',
  )

  await debeFallar(
    'guardar_goles',
    {
      p_token: token,
      p_partido_id: partidoId,
      p_goles: [{ jugador_id: todos[0], goles: 1 }],
    },
    'cargar goles de un partido todavía programado',
  )

  await rpc('agregar_jugador_partido', {
    p_token: token,
    p_partido_id: partidoId,
    p_jugador_id: todos[9],
    p_equipo: 'B',
  })
  await rpc('comenzar_partido', { p_token: token, p_partido_id: partidoId })
  ok(true, 'comenzar_partido con 5 y 5')

  await debeFallar(
    'agregar_jugador_partido',
    { p_token: token, p_partido_id: partidoId, p_jugador_id: todos[0], p_equipo: 'A' },
    'tocar el plantel ya empezado',
  )
  await debeFallar(
    'finalizar_partido',
    { p_token: token, p_partido_id: partidoId },
    'finalizar sin resultado cargado',
  )

  await rpc('cargar_resultado', {
    p_token: token,
    p_partido_id: partidoId,
    p_goles_a: 4,
    p_goles_b: 2,
  })

  // ============ goles por jugador ============
  // Una carga toda en cero no es un 0-0: el resultado tiene que quedar como está.
  await rpc('guardar_goles', {
    p_token: token,
    p_partido_id: partidoId,
    p_goles: todos.map(jid => ({ jugador_id: jid, goles: 0 })),
  })
  const [trasCero] = await rpc('obtener_partido', { p_token: token, p_partido_id: partidoId })
  ok(
    trasCero.goles_a === 4 && trasCero.goles_b === 2,
    'una carga de goles toda en cero no toca el resultado cargado a mano',
  )

  // Se pueden cargar con el partido en curso, antes de finalizar, y el
  // marcador se recalcula con la suma de cada equipo.
  const golesA = [2, 1, 1, 0, 0]
  ok(
    (await rpc('guardar_goles', {
      p_token: token,
      p_partido_id: partidoId,
      p_goles: todos.slice(0, 5).map((jid, i) => ({ jugador_id: jid, goles: golesA[i] })),
    })) === 5,
    'guardar_goles atribuye los 4 goles del equipo A con el partido en curso',
  )
  const [trasA] = await rpc('obtener_partido', { p_token: token, p_partido_id: partidoId })
  ok(
    trasA.goles_a === 4 && trasA.goles_b === 0,
    `los goles individuales recalculan el resultado (${trasA.goles_a}-${trasA.goles_b})`,
  )

  await rpc('finalizar_partido', { p_token: token, p_partido_id: partidoId })
  ok(true, 'cargar_resultado 4-2 y finalizar_partido')

  // Ya finalizado siguen abiertos: un gol es un hecho del partido, no un voto
  // que haya que congelar como los puntajes.
  await rpc('guardar_goles', {
    p_token: token,
    p_partido_id: partidoId,
    p_goles: todos.slice(5).map((jid, i) => ({ jugador_id: jid, goles: i < 2 ? 1 : 0 })),
  })
  const conGoles = await rpc('plantel_partido', { p_token: token, p_partido_id: partidoId })
  const sumaA = conGoles.filter(p => p.equipo === 'A').reduce((t, p) => t + p.goles, 0)
  const sumaB = conGoles.filter(p => p.equipo === 'B').reduce((t, p) => t + p.goles, 0)
  ok(
    sumaA === 4 && sumaB === 2,
    `plantel_partido devuelve los goles cargados y suman el resultado (${sumaA}-${sumaB})`,
  )

  // Carga parcial: reenviar un solo jugador no borra los goles de los demás.
  await rpc('guardar_goles', {
    p_token: token,
    p_partido_id: partidoId,
    p_goles: [{ jugador_id: todos[0], goles: 3 }],
  })
  const trasParcial = await rpc('plantel_partido', { p_token: token, p_partido_id: partidoId })
  ok(
    trasParcial.find(p => p.jugador_id === todos[0]).goles === 3 &&
      trasParcial.filter(p => p.equipo === 'A').reduce((t, p) => t + p.goles, 0) === 5,
    'una carga parcial corrige a un jugador y deja los goles del resto',
  )
  const [trasCorregir] = await rpc('obtener_partido', { p_token: token, p_partido_id: partidoId })
  ok(
    trasCorregir.goles_a === 5 && trasCorregir.goles_b === 2,
    `el recálculo suma el plantel completo, no solo la carga parcial (${trasCorregir.goles_a}-${trasCorregir.goles_b})`,
  )

  await debeFallar(
    'guardar_goles',
    { p_token: token, p_partido_id: partidoId, p_goles: [{ jugador_id: todos[0], goles: -1 }] },
    'goles negativos',
  )
  await debeFallar(
    'guardar_goles',
    { p_token: token, p_partido_id: partidoId, p_goles: [{ jugador_id: 999999, goles: 1 }] },
    'goles de un jugador que no jugó el partido',
  )
  await debeFallar(
    'guardar_goles',
    {
      p_token: token,
      p_partido_id: partidoId,
      p_goles: [
        { jugador_id: todos[0], goles: 1 },
        { jugador_id: todos[0], goles: 2 },
      ],
    },
    'un jugador repetido en la misma carga de goles',
  )

  // ============ corrección del resultado (solo admin) ============
  // `cargar_resultado` solo acepta el partido en curso; con la fecha ya
  // finalizada, la única vía es `corregir_resultado`.
  await debeFallar(
    'cargar_resultado',
    { p_token: token, p_partido_id: partidoId, p_goles_a: 7, p_goles_b: 3 },
    'cargar_resultado con el partido ya finalizado',
  )
  await rpc('corregir_resultado', {
    p_token: token,
    p_partido_id: partidoId,
    p_goles_a: 7,
    p_goles_b: 3,
  })
  const [corregido] = await rpc('obtener_partido', { p_token: token, p_partido_id: partidoId })
  ok(
    corregido.goles_a === 7 && corregido.goles_b === 3,
    `corregir_resultado cambia el marcador de una fecha finalizada (${corregido.goles_a}-${corregido.goles_b})`,
  )
  await debeFallar(
    'corregir_resultado',
    { p_token: token, p_partido_id: partidoId, p_goles_a: -1, p_goles_b: 0 },
    'corregir con goles negativos',
  )
  await debeFallar(
    'corregir_resultado',
    { p_token: token, p_partido_id: 999999, p_goles_a: 1, p_goles_b: 0 },
    'corregir una fecha que no existe',
  )

  // ============ puntajes del propio jugador ============
  await debeFallar(
    'guardar_puntajes',
    { p_token: token, p_partido_id: partidoId, p_puntajes: [{ jugador_id: todos[0], puntaje: 7 }] },
    'puntajes incompletos',
  )

  const votos = todos.map((jid, i) => ({ jugador_id: jid, puntaje: 6 + (i % 5) * 0.5 }))
  ok(
    (await rpc('guardar_puntajes', {
      p_token: token,
      p_partido_id: partidoId,
      p_puntajes: votos,
    })) === 10,
    'guardar_puntajes con array JS → jsonb',
  )

  const mios = await rpc('mis_puntajes', { p_token: token, p_partido_id: partidoId })
  ok(mios.length === 10, 'mis_puntajes devuelve los 10 para precargar el formulario')

  await rpc('guardar_puntajes', {
    p_token: token,
    p_partido_id: partidoId,
    p_puntajes: todos.map(jid => ({ jugador_id: jid, puntaje: 9 })),
  })
  const mios2 = await rpc('mis_puntajes', { p_token: token, p_partido_id: partidoId })
  ok(
    mios2.length === 10 && mios2.every(m => Number(m.puntaje) === 9),
    'reenviar corrige, no duplica',
  )

  // ============ grilla de administrador ============
  const matriz = await rpc('matriz_puntajes', { p_token: token, p_partido_id: partidoId })
  ok(matriz.length === 10, `matriz_puntajes ve los votos cargados (${matriz.length})`)

  // el admin carga los votos de OTRO jugador
  const otro = creados[0]
  const celdas = todos.map(jid => ({ autor_id: otro, jugador_id: jid, puntaje: 7 }))
  await rpc('guardar_grilla_puntajes', {
    p_token: token,
    p_partido_id: partidoId,
    p_celdas: celdas,
  })
  const matriz2 = await rpc('matriz_puntajes', { p_token: token, p_partido_id: partidoId })
  ok(matriz2.length === 20, `el admin cargó la fila de otro jugador (${matriz2.length} celdas)`)

  // puntaje null borra la celda
  await rpc('guardar_grilla_puntajes', {
    p_token: token,
    p_partido_id: partidoId,
    p_celdas: [{ autor_id: otro, jugador_id: todos[0], puntaje: null }],
  })
  const matriz3 = await rpc('matriz_puntajes', { p_token: token, p_partido_id: partidoId })
  ok(matriz3.length === 19, 'puntaje null borra la celda')

  await debeFallar(
    'guardar_grilla_puntajes',
    {
      p_token: token,
      p_partido_id: partidoId,
      p_celdas: [{ autor_id: 999999, jugador_id: todos[0], puntaje: 5 }],
    },
    'celda con un autor que no jugó el partido',
  )

  // ============ mejor y peor puntaje de cada planilla ============
  // Las dos planillas cargadas hasta acá son planas (una toda 9, la otra toda
  // 7): un autor que puntúa igual a todos no elige mejor ni peor a nadie.
  const planas = await rpc('plantel_partido', { p_token: token, p_partido_id: partidoId })
  ok(
    planas.every(p => p.mejores === 0 && p.peores === 0),
    'una planilla con el mismo puntaje para todos no elige mejor ni peor',
  )

  // Ahora una planilla que sí distingue: 10 al primero, 1 al último.
  await rpc('guardar_grilla_puntajes', {
    p_token: token,
    p_partido_id: partidoId,
    p_celdas: [
      { autor_id: otro, jugador_id: todos[0], puntaje: 10 },
      { autor_id: otro, jugador_id: todos[9], puntaje: 1 },
    ],
  })
  const conDestacados = await rpc('plantel_partido', { p_token: token, p_partido_id: partidoId })
  const elMejor = conDestacados.find(p => p.jugador_id === todos[0])
  const elPeor = conDestacados.find(p => p.jugador_id === todos[9])
  ok(
    elMejor.mejores === 1 && elMejor.peores === 0,
    `el máximo de una planilla cuenta como mejor puntaje (${elMejor.mejores})`,
  )
  ok(
    elPeor.peores === 1 && elPeor.mejores === 0,
    `el mínimo de una planilla cuenta como peor puntaje (${elPeor.peores})`,
  )
  ok(
    conDestacados
      .filter(p => p.jugador_id !== todos[0] && p.jugador_id !== todos[9])
      .every(p => p.mejores === 0 && p.peores === 0),
    'los del medio de la planilla no cuentan ni como mejor ni como peor',
  )

  // Empate dentro de una planilla: si el máximo lo comparten dos, cuenta a los dos.
  await rpc('guardar_grilla_puntajes', {
    p_token: token,
    p_partido_id: partidoId,
    p_celdas: [{ autor_id: otro, jugador_id: todos[1], puntaje: 10 }],
  })
  const conEmpate = await rpc('plantel_partido', { p_token: token, p_partido_id: partidoId })
  ok(
    conEmpate.filter(p => p.mejores === 1).length === 2,
    'un empate en el máximo de la planilla cuenta para los dos empatados',
  )

  // un jugador común NO puede ver ni tocar la grilla
  const loginComun = await rpc('iniciar_sesion', {
    p_email: 'e2e2@prueba.local',
    p_clave: 'clave-e2e',
  })
  ok(loginComun.length === 1 && loginComun[0].es_admin === false, 'jugador común no es admin')
  const tokenComun = loginComun[0].token

  await debeFallar(
    'matriz_puntajes',
    { p_token: tokenComun, p_partido_id: partidoId },
    'jugador común mirando la grilla',
  )
  await debeFallar(
    'guardar_grilla_puntajes',
    {
      p_token: tokenComun,
      p_partido_id: partidoId,
      p_celdas: [{ autor_id: todos[1], jugador_id: todos[0], puntaje: 10 }],
    },
    'jugador común editando la grilla',
  )

  // ============ permisos de jugadores ============
  // El ABM es solo de admin; cada jugador edita únicamente su propia fila.
  await debeFallar(
    'crear_jugador',
    {
      p_token: tokenComun,
      p_nombre: 'Intruso',
      p_apellido: 'Intruso',
      p_apodo: null,
      p_email: 'e2e-intruso@prueba.local',
      p_clave: 'clave-e2e',
      p_es_admin: false,
    },
    'jugador común creando un jugador',
  )
  await debeFallar(
    'eliminar_jugador',
    { p_token: tokenComun, p_id: creados[0] },
    'jugador común dando de baja a otro',
  )
  await debeFallar(
    'actualizar_jugador',
    {
      p_token: tokenComun,
      p_id: creados[0],
      p_nombre: 'Editado',
      p_apellido: 'Ajeno',
      p_apodo: null,
      p_email: 'e2e1@prueba.local',
      p_clave: null,
      p_es_admin: null,
    },
    'jugador común editando los datos de otro',
  )

  // Lo suyo sí lo puede editar, pero el flag de admin se ignora.
  await rpc('actualizar_jugador', {
    p_token: tokenComun,
    p_id: creados[1],
    p_nombre: 'Bruno',
    p_apellido: 'Yanez',
    p_apodo: 'bru',
    p_email: 'e2e2@prueba.local',
    p_clave: null,
    p_es_admin: true,
  })
  await debeFallar(
    'corregir_resultado',
    { p_token: tokenComun, p_partido_id: partidoId, p_goles_a: 9, p_goles_b: 9 },
    'jugador común corrigiendo el resultado',
  )

  const [suFila] = await rpc('mi_jugador', { p_token: tokenComun })
  ok(
    suFila?.id === creados[1] && suFila?.apodo === 'bru',
    'un jugador común edita sus propios datos',
  )
  ok(suFila?.es_admin === false, 'un jugador común no puede marcarse administrador')
  const [miFila] = await rpc('mi_jugador', { p_token: token })
  ok(miFila?.id === yoId, 'mi_jugador devuelve solo la fila del token')

  // ============ cierre de puntajes por fecha posterior ============
  const [antesDeCerrar] = await rpc('obtener_partido', { p_token: token, p_partido_id: partidoId })
  ok(antesDeCerrar.puntajes_cerrados === false, 'la última fecha tiene los puntajes abiertos')

  // La fecha posterior lleva un jugador de prueba adentro para que
  // `limpiar_datos_prueba` también se la lleve al terminar.
  const partidoPosterior = await rpc('crear_partido', {
    p_token: token,
    p_fecha: sumarDias(antesDeCerrar.fecha, 7),
  })
  await rpc('agregar_jugador_partido', {
    p_token: token,
    p_partido_id: partidoPosterior,
    p_jugador_id: creados[0],
    p_equipo: 'A',
  })

  const [trasCerrar] = await rpc('obtener_partido', { p_token: token, p_partido_id: partidoId })
  ok(
    trasCerrar.puntajes_cerrados === true,
    'con una fecha posterior cargada, puntajes_cerrados pasa a true',
  )
  await debeFallar(
    'guardar_puntajes',
    {
      p_token: token,
      p_partido_id: partidoId,
      p_puntajes: todos.map(jid => ({ jugador_id: jid, puntaje: 6 })),
    },
    'puntajes de una fecha ya cerrada',
  )
  ok(
    (await rpc('guardar_grilla_puntajes', {
      p_token: token,
      p_partido_id: partidoId,
      p_celdas: [{ autor_id: todos[0], jugador_id: todos[1], puntaje: 7 }],
    })) === 1,
    'la grilla del admin sigue abierta aunque la fecha esté cerrada',
  )

  // El admin corrige el resultado en cualquier estado, incluso programado.
  await rpc('corregir_resultado', {
    p_token: token,
    p_partido_id: partidoPosterior,
    p_goles_a: 2,
    p_goles_b: 1,
  })
  const [posteriorConResultado] = await rpc('obtener_partido', {
    p_token: token,
    p_partido_id: partidoPosterior,
  })
  ok(
    posteriorConResultado.estado === 'programado' &&
      posteriorConResultado.goles_a === 2 &&
      posteriorConResultado.goles_b === 1,
    'corregir_resultado también funciona con la fecha en programado',
  )

  // ============ eliminar una fecha (solo admin) ============
  await debeFallar(
    'eliminar_partido',
    { p_token: tokenComun, p_partido_id: partidoPosterior },
    'jugador común eliminando una fecha',
  )

  const [borrado] = await rpc('eliminar_partido', {
    p_token: token,
    p_partido_id: partidoPosterior,
  })
  ok(
    borrado?.estado === 'programado' && borrado?.jugadores === 1,
    `eliminar_partido devuelve qué se llevó (${borrado?.estado}, ${borrado?.jugadores} jugador)`,
  )
  const vacio = await rpc('obtener_partido', { p_token: token, p_partido_id: partidoPosterior })
  ok(vacio.length === 0, 'la fecha eliminada ya no existe')
  const [reabierto] = await rpc('obtener_partido', { p_token: token, p_partido_id: partidoId })
  ok(
    reabierto.puntajes_cerrados === false,
    'al borrar la fecha posterior, los puntajes de la anterior se reabren',
  )
  await debeFallar(
    'eliminar_partido',
    { p_token: token, p_partido_id: partidoPosterior },
    'eliminar una fecha que ya no existe',
  )

  // ============ dashboard ============
  const [stats] = await rpc('estadisticas', { p_token: token })
  ok(
    stats.partidos_jugados === baseStats.partidos_jugados + 1,
    `partidos_jugados suma 1 (${baseStats.partidos_jugados} → ${stats.partidos_jugados})`,
  )
  ok(
    stats.partidos_ganados === baseStats.partidos_ganados + 1,
    `partidos_ganados suma 1: jugué en A y ganó (${baseStats.partidos_ganados} → ${stats.partidos_ganados})`,
  )

  // La tabla del módulo de estadísticas: mi fila tiene que moverse igual que
  // `estadisticas`, y los 9 jugadores de prueba tienen que aparecer.
  const tabla = await rpc('estadisticas_jugadores', { p_token: token })
  const mia = tabla.find(f => f.jugador_id === yoId)
  ok(
    mia?.partidos_jugados === baseMia.partidos_jugados + 1 &&
      mia?.partidos_ganados === baseMia.partidos_ganados + 1,
    `estadisticas_jugadores suma la fecha nueva a mi fila (${baseMia.partidos_ganados} → ${mia?.partidos_ganados} ganados)`,
  )
  ok(
    mia?.partidos_jugados ===
      mia?.partidos_ganados + mia?.partidos_empatados + mia?.partidos_perdidos,
    'jugados = ganados + empatados + perdidos',
  )
  ok(
    tabla.length >= baseTabla.length + 9,
    `la tabla incluye los 9 jugadores de prueba (${baseTabla.length} → ${tabla.length})`,
  )

  // MVP / WVP: en la fecha de prueba quedaron dos planillas cargadas. En la
  // mía todos tienen 9 menos todos[1], y en la del otro autor todos[0] y
  // todos[1] tienen 10 y todos[9] un 1. Así todos[0] junta 2 «mejores» y se
  // lleva el MVP solo, mientras el peor queda empatado en 1 entre todos[1] y
  // todos[9]: los dos se llevan el WVP de la fecha.
  ok(
    mia?.mvp === baseMia.mvp + 1,
    `estadisticas_jugadores suma el MVP de la fecha nueva (${baseMia.mvp} → ${mia?.mvp})`,
  )
  const empatadosWvp = tabla.filter(
    f => (f.jugador_id === todos[1] || f.jugador_id === todos[9]) && f.wvp === 1,
  )
  ok(
    empatadosWvp.length === 2 && mia?.wvp === baseMia.wvp,
    'el WVP de una fecha se comparte entre los dos empatados en el peor puntaje',
  )
  const tablaComun = await rpc('estadisticas_jugadores', { p_token: tokenComun })
  ok(
    tablaComun.length === tabla.length,
    'un jugador común también ve la tabla de estadísticas del grupo',
  )
  await debeFallar(
    'estadisticas_jugadores',
    { p_token: '00000000-0000-0000-0000-000000000000' },
    'estadisticas_jugadores con token inválido',
  )

  const mp = await rpc('mis_partidos', { p_token: token })
  ok(
    mp.find(p => p.id === partidoId)?.resultado === 'ganado',
    'mis_partidos marca el partido nuevo como ganado',
  )
  // `ya_puntue` es lo que usa el inicio para apretar al que no votó.
  ok(
    mp.find(p => p.id === partidoId)?.ya_puntue === true,
    'mis_partidos marca ya_puntue en la fecha que voté',
  )
  const mpComun = await rpc('mis_partidos', { p_token: tokenComun })
  ok(
    mpComun.find(p => p.id === partidoId)?.ya_puntue === false,
    'y en false para quien no cargó sus puntajes',
  )

  const [det] = await rpc('obtener_partido', { p_token: token, p_partido_id: partidoId })
  ok(det.soy_participante === true && det.ya_puntue === true, 'flags soy_participante y ya_puntue')

  // ============ las tablas siguen cerradas al cliente ============
  const { data: fuga } = await sb.from('jugadores').select('*')
  ok(Array.isArray(fuga) && fuga.length === 0, 'select directo a jugadores sigue bloqueado por RLS')
  const { data: fuga2 } = await sb.from('puntajes').select('*')
  ok(Array.isArray(fuga2) && fuga2.length === 0, 'select directo a puntajes sigue bloqueado por RLS')
} catch (e) {
  console.error('EXCEPCIÓN:', e.message)
  fallos++
} finally {
  // Limpieza: borra solo lo que termina en @prueba.local, nunca datos reales.
  if (token) {
    const { data, error } = await sb.rpc('limpiar_datos_prueba', { p_token: token })
    if (error) {
      console.error(`\nNO SE PUDO LIMPIAR: ${error.message}`)
      fallos++
    } else {
      const [r] = data
      console.log(
        `\nLimpieza: ${r.jugadores_borrados} jugadores y ${r.partidos_borrados} partidos de prueba borrados.`,
      )
    }
  }
  console.log(`${fallos === 0 ? 'TODO OK' : `${fallos} FALLAS`}`)
  process.exit(fallos === 0 ? 0 : 1)
}
