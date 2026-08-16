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

  partidoId = await rpc('crear_partido', { p_token: token, p_fecha: null })
  const [det0] = await rpc('obtener_partido', { p_token: token, p_partido_id: partidoId })
  ok(det0.fecha === jueves, 'crear_partido sin fecha usa el próximo jueves')
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
  await rpc('finalizar_partido', { p_token: token, p_partido_id: partidoId })
  ok(true, 'cargar_resultado 4-2 y finalizar_partido')

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

  // ============ dashboard ============
  const [stats] = await rpc('estadisticas', { p_token: token })
  ok(
    stats.partidos_jugados === baseStats.partidos_jugados + 1,
    `partidos_jugados suma 1 (${baseStats.partidos_jugados} → ${stats.partidos_jugados})`,
  )
  ok(
    stats.partidos_ganados === baseStats.partidos_ganados + 1,
    `partidos_ganados suma 1: jugué en A y ganó 4-2 (${baseStats.partidos_ganados} → ${stats.partidos_ganados})`,
  )

  const mp = await rpc('mis_partidos', { p_token: token })
  ok(
    mp.find(p => p.id === partidoId)?.resultado === 'ganado',
    'mis_partidos marca el partido nuevo como ganado',
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
