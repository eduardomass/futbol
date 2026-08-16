// Prueba end-to-end de las RPC tal como las llama el frontend:
// mismo cliente supabase-js, misma publishable key, misma base.
//
//   npm run prueba:e2e
//
// OJO: corre contra la base REAL y deja datos de prueba (9 jugadores
// `e2e*@prueba.local` y un partido). No puede limpiarlos solo porque RLS
// bloquea el DELETE desde el cliente, que es justamente lo que queremos.
// Para limpiar, ejecutar en el SQL Editor de Supabase:
//
//   delete from public.partidos p
//   where exists (select 1 from public.partido_jugadores pj
//                 join public.jugadores j on j.id = pj.jugador_id
//                 where pj.partido_id = p.id and j.email like 'e2e%@prueba.local');
//   delete from public.jugadores where email like 'e2e%@prueba.local';
//   delete from public.sesiones;
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

const creados = []
let partidoId = null
let token = null

try {
  // --- login ---
  const login = await rpc('iniciar_sesion', {
    p_email: 'eduardomass@gmail.com',
    p_clave: 'fenixFENIX123',
  })
  ok(login.length === 1, 'iniciar_sesion devuelve la sesión')
  token = login[0].token
  const yoId = login[0].jugador_id
  ok(!!token && yoId, `token y jugador_id (${yoId})`)

  const malo = await rpc('iniciar_sesion', {
    p_email: 'eduardomass@gmail.com',
    p_clave: 'claveIncorrecta',
  })
  ok(malo.length === 0, 'clave incorrecta no devuelve sesión')

  // --- ABM jugadores ---
  for (let i = 1; i <= 9; i++) {
    creados.push(
      await rpc('crear_jugador', {
        p_token: token,
        p_nombre: `E2E${i}`,
        p_apellido: `Test${i}`,
        p_apodo: `e${i}`,
        p_email: `e2e${i}@prueba.local`,
        p_clave: 'x',
      }),
    )
  }
  ok(creados.length === 9, 'crear_jugador x9')

  await rpc('actualizar_jugador', {
    p_token: token,
    p_id: creados[0],
    p_nombre: 'Editado',
    p_apellido: 'Test1',
    p_apodo: 'edit',
    p_email: 'e2e1@prueba.local',
    p_clave: null,
  })
  const lista = await rpc('listar_jugadores', { p_token: token, p_incluir_inactivos: false })
  ok(
    lista.some(j => j.nombre === 'Editado'),
    'actualizar_jugador con clave null conserva la clave y edita el resto',
  )
  ok(lista.length === 10, `listar_jugadores devuelve 10 (dio ${lista.length})`)

  await debeFallar(
    'crear_jugador',
    { p_token: token, p_nombre: 'Dup', p_apellido: 'Dup', p_apodo: null, p_email: 'e2e1@prueba.local', p_clave: 'x' },
    'email duplicado',
  )
  await debeFallar(
    'listar_jugadores',
    { p_token: '00000000-0000-0000-0000-000000000000', p_incluir_inactivos: false },
    'token inválido',
  )

  // --- partido ---
  const jueves = await rpc('proximo_jueves')
  ok(new Date(jueves + 'T00:00:00').getDay() === 4, `proximo_jueves() cae jueves (${jueves})`)

  partidoId = await rpc('crear_partido', { p_token: token, p_fecha: null })
  const det0 = await rpc('obtener_partido', { p_token: token, p_partido_id: partidoId })
  ok(det0[0].fecha === jueves, 'crear_partido sin fecha usa el próximo jueves')
  ok(det0[0].estado === 'programado', 'nace en estado programado')

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

  // --- puntajes ---
  await debeFallar(
    'guardar_puntajes',
    {
      p_token: token,
      p_partido_id: partidoId,
      p_puntajes: [{ jugador_id: todos[0], puntaje: 7 }],
    },
    'puntajes incompletos',
  )

  const votos = todos.map((jid, i) => ({ jugador_id: jid, puntaje: 6 + (i % 5) * 0.5 }))
  const guardados = await rpc('guardar_puntajes', {
    p_token: token,
    p_partido_id: partidoId,
    p_puntajes: votos,
  })
  ok(guardados === 10, `guardar_puntajes con array JS → jsonb (guardó ${guardados})`)

  const mios = await rpc('mis_puntajes', { p_token: token, p_partido_id: partidoId })
  ok(mios.length === 10, 'mis_puntajes devuelve los 10 para precargar el formulario')

  // reenviar corrige en vez de duplicar
  const votos2 = todos.map(jid => ({ jugador_id: jid, puntaje: 9 }))
  await rpc('guardar_puntajes', { p_token: token, p_partido_id: partidoId, p_puntajes: votos2 })
  const mios2 = await rpc('mis_puntajes', { p_token: token, p_partido_id: partidoId })
  ok(mios2.length === 10 && mios2.every(m => Number(m.puntaje) === 9), 'reenviar corrige, no duplica')

  // --- dashboard ---
  const [stats] = await rpc('estadisticas', { p_token: token })
  ok(stats.partidos_jugados === 1, `partidos_jugados = 1 (dio ${stats.partidos_jugados})`)
  ok(stats.partidos_ganados === 1, `partidos_ganados = 1, jugué en A y ganó 4-2 (dio ${stats.partidos_ganados})`)
  ok(Number(stats.promedio_general) === 9, `promedio_general = 9 (dio ${stats.promedio_general})`)

  const mp = await rpc('mis_partidos', { p_token: token })
  ok(mp.length === 1 && mp[0].resultado === 'ganado', 'mis_partidos marca el partido como ganado')

  const [det] = await rpc('obtener_partido', { p_token: token, p_partido_id: partidoId })
  ok(Number(det.promedio_fecha) === 9, `promedio de la fecha = 9 (dio ${det.promedio_fecha})`)
  ok(det.soy_participante === true && det.ya_puntue === true, 'flags soy_participante y ya_puntue')

  // --- las tablas siguen cerradas al cliente ---
  const { data: fuga } = await sb.from('jugadores').select('*')
  ok(Array.isArray(fuga) && fuga.length === 0, 'select directo a jugadores sigue bloqueado por RLS')
  const { data: fuga2 } = await sb.from('sesiones').select('*')
  ok(Array.isArray(fuga2) && fuga2.length === 0, 'select directo a sesiones sigue bloqueado por RLS')
} catch (e) {
  console.error('EXCEPCIÓN:', e.message)
  fallos++
} finally {
  if (partidoId) {
    console.log(`\nDatos de prueba creados (partido ${partidoId}). Ver cómo limpiarlos arriba.`)
  }
  console.log(`\n${fallos === 0 ? 'TODO OK' : `${fallos} FALLAS`}`)
  process.exit(fallos === 0 ? 0 : 1)
}
