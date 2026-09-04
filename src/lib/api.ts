import { supabase } from './supabase'
import type {
  CeldaPuntaje,
  Estadisticas,
  EstadisticaJugador,
  Jugador,
  MiPartido,
  PartidoDetalle,
  PartidoResumen,
  PlantelItem,
  Sesion,
} from '@/types'

/**
 * Toda la app habla con la base por funciones RPC. Ninguna tabla es accesible
 * directamente: tienen RLS sin policies. Ver supabase/migrations/0002.
 */
async function rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  if (!supabase) {
    throw new Error('La app no tiene configuradas las credenciales de Supabase.')
  }
  const { data, error } = await supabase.rpc(fn, args)
  if (error) throw new Error(error.message)
  return data as T
}

// ---------- sesión ----------

export async function iniciarSesion(email: string, clave: string): Promise<Sesion | null> {
  const filas = await rpc<
    { token: string; jugador_id: number | null; nombre: string; es_admin: boolean }[]
  >('iniciar_sesion', { p_email: email, p_clave: clave })

  const fila = filas?.[0]
  if (!fila) return null

  return {
    token: fila.token,
    jugadorId: fila.jugador_id,
    nombre: fila.nombre,
    esAdmin: fila.es_admin,
  }
}

export async function cerrarSesion(token: string): Promise<void> {
  await rpc('cerrar_sesion', { p_token: token })
}

/**
 * Vuelve a preguntarle a la base por el token guardado. Devuelve `null` si
 * venció o ya no existe. Sirve para no quedarse con datos viejos pegados en
 * localStorage: por ejemplo, un jugador al que recién marcaron administrador.
 */
export async function sesionActual(token: string): Promise<Sesion | null> {
  const filas = await rpc<
    { jugador_id: number | null; nombre: string; es_admin: boolean }[]
  >('sesion_actual', { p_token: token })

  const fila = filas?.[0]
  if (!fila) return null

  return {
    token,
    jugadorId: fila.jugador_id,
    nombre: fila.nombre,
    esAdmin: fila.es_admin,
  }
}

// ---------- jugadores ----------

export function listarJugadores(token: string, incluirInactivos = false): Promise<Jugador[]> {
  return rpc('listar_jugadores', { p_token: token, p_incluir_inactivos: incluirInactivos })
}

/**
 * La fila del jugador de la sesión. Es lo que ve un jugador común en la
 * pantalla de jugadores: sus datos, sin los de los demás.
 */
export async function miJugador(token: string): Promise<Jugador | null> {
  const filas = await rpc<Jugador[]>('mi_jugador', { p_token: token })
  return filas?.[0] ?? null
}

export type DatosJugador = {
  nombre: string
  apellido: string
  apodo: string
  email: string
  clave: string
  esAdmin: boolean
}

export function crearJugador(token: string, datos: DatosJugador): Promise<number> {
  return rpc('crear_jugador', {
    p_token: token,
    p_nombre: datos.nombre,
    p_apellido: datos.apellido,
    p_apodo: datos.apodo,
    p_email: datos.email,
    p_clave: datos.clave,
    p_es_admin: datos.esAdmin,
  })
}

export function actualizarJugador(
  token: string,
  id: number,
  datos: DatosJugador,
): Promise<void> {
  return rpc('actualizar_jugador', {
    p_token: token,
    p_id: id,
    p_nombre: datos.nombre,
    p_apellido: datos.apellido,
    p_apodo: datos.apodo,
    p_email: datos.email,
    // vacío = no cambiar la clave
    p_clave: datos.clave || null,
    p_es_admin: datos.esAdmin,
  })
}

export function eliminarJugador(token: string, id: number): Promise<string> {
  return rpc('eliminar_jugador', { p_token: token, p_id: id })
}

// ---------- partidos ----------

export function proximoJueves(): Promise<string> {
  return rpc('proximo_jueves')
}

export function crearPartido(token: string, fecha: string | null): Promise<number> {
  return rpc('crear_partido', { p_token: token, p_fecha: fecha })
}

/**
 * Borra la fecha entera: el plantel y todos los puntajes cargados se van con
 * ella por el `on delete cascade`. Solo administradores. Devuelve qué se
 * llevó, para poder avisarlo.
 */
export async function eliminarPartido(
  token: string,
  partidoId: number,
): Promise<{ fecha: string; estado: string; jugadores: number; puntajes: number } | null> {
  const filas = await rpc<
    { fecha: string; estado: string; jugadores: number; puntajes: number }[]
  >('eliminar_partido', { p_token: token, p_partido_id: partidoId })
  return filas?.[0] ?? null
}

export function listarPartidos(token: string): Promise<PartidoResumen[]> {
  return rpc('listar_partidos', { p_token: token })
}

export async function obtenerPartido(
  token: string,
  partidoId: number,
): Promise<PartidoDetalle | null> {
  const filas = await rpc<PartidoDetalle[]>('obtener_partido', {
    p_token: token,
    p_partido_id: partidoId,
  })
  return filas?.[0] ?? null
}

export function plantelPartido(token: string, partidoId: number): Promise<PlantelItem[]> {
  return rpc('plantel_partido', { p_token: token, p_partido_id: partidoId })
}

export function agregarJugadorPartido(
  token: string,
  partidoId: number,
  jugadorId: number,
  equipo: 'A' | 'B',
): Promise<void> {
  return rpc('agregar_jugador_partido', {
    p_token: token,
    p_partido_id: partidoId,
    p_jugador_id: jugadorId,
    p_equipo: equipo,
  })
}

export function quitarJugadorPartido(
  token: string,
  partidoId: number,
  jugadorId: number,
): Promise<void> {
  return rpc('quitar_jugador_partido', {
    p_token: token,
    p_partido_id: partidoId,
    p_jugador_id: jugadorId,
  })
}

export function comenzarPartido(token: string, partidoId: number): Promise<void> {
  return rpc('comenzar_partido', { p_token: token, p_partido_id: partidoId })
}

export function cargarResultado(
  token: string,
  partidoId: number,
  golesA: number,
  golesB: number,
): Promise<void> {
  return rpc('cargar_resultado', {
    p_token: token,
    p_partido_id: partidoId,
    p_goles_a: golesA,
    p_goles_b: golesB,
  })
}

/**
 * Corrige el marcador de una fecha. **Solo administradores**, y sin límite de
 * estado: es la vía para arreglar un resultado mal cargado después de
 * finalizada la fecha, cuando `cargarResultado` ya no acepta.
 *
 * Ojo: `guardarGoles` recalcula el marcador con la suma de los goleadores, así
 * que una corrección a mano se pierde si después se guardan los goles de esa
 * misma fecha.
 */
export function corregirResultado(
  token: string,
  partidoId: number,
  golesA: number,
  golesB: number,
): Promise<void> {
  return rpc('corregir_resultado', {
    p_token: token,
    p_partido_id: partidoId,
    p_goles_a: golesA,
    p_goles_b: golesB,
  })
}

export function finalizarPartido(token: string, partidoId: number): Promise<void> {
  return rpc('finalizar_partido', { p_token: token, p_partido_id: partidoId })
}

/**
 * Vuelve un estado atrás en el ciclo de vida de la fecha: `finalizado` pasa a
 * `en_curso`, y `en_curso` a `programado`. Solo admin (migración `0015`).
 *
 * Es la salida cuando se finalizó una fecha por error: no borra el marcador ni
 * los puntajes ya cargados. Devuelve el estado anterior y el nuevo.
 */
export async function reabrirPartido(
  token: string,
  partidoId: number,
): Promise<{ estado_anterior: string; estado_nuevo: string } | null> {
  const filas = await rpc<{ estado_anterior: string; estado_nuevo: string }[]>('reabrir_partido', {
    p_token: token,
    p_partido_id: partidoId,
  })
  return filas?.[0] ?? null
}

/**
 * Atribuye los goles del partido a cada jugador. `goles_a` / `goles_b` del
 * partido siguen siendo el resultado oficial: los individuales pueden sumar
 * menos, por ejemplo si hubo un gol en contra. Acepta cargas parciales y se
 * puede reenviar para corregir. Devuelve cuántas filas tocó.
 */
export function guardarGoles(
  token: string,
  partidoId: number,
  goles: { jugador_id: number; goles: number }[],
): Promise<number> {
  return rpc('guardar_goles', {
    p_token: token,
    p_partido_id: partidoId,
    p_goles: goles,
  })
}

// ---------- puntajes ----------

export function guardarPuntajes(
  token: string,
  partidoId: number,
  puntajes: { jugador_id: number; puntaje: number }[],
): Promise<number> {
  return rpc('guardar_puntajes', {
    p_token: token,
    p_partido_id: partidoId,
    p_puntajes: puntajes,
  })
}

export function misPuntajes(
  token: string,
  partidoId: number,
): Promise<{ jugador_id: number; puntaje: number }[]> {
  return rpc('mis_puntajes', { p_token: token, p_partido_id: partidoId })
}

// ---------- grilla de puntajes (solo administradores) ----------

export function matrizPuntajes(token: string, partidoId: number): Promise<CeldaPuntaje[]> {
  return rpc('matriz_puntajes', { p_token: token, p_partido_id: partidoId })
}

export function guardarGrillaPuntajes(
  token: string,
  partidoId: number,
  celdas: CeldaPuntaje[],
): Promise<number> {
  return rpc('guardar_grilla_puntajes', {
    p_token: token,
    p_partido_id: partidoId,
    p_celdas: celdas,
  })
}

// ---------- dashboard ----------

export async function estadisticas(token: string): Promise<Estadisticas> {
  const filas = await rpc<Estadisticas[]>('estadisticas', { p_token: token })
  return (
    filas?.[0] ?? {
      partidos_jugados: 0,
      partidos_ganados: 0,
      partidos_empatados: 0,
      partidos_perdidos: 0,
      promedio_general: null,
    }
  )
}

/**
 * Tabla del grupo: cada jugador con jugados, ganados, empatados y perdidos.
 * Cuenta solo partidos finalizados con resultado cargado.
 */
export function estadisticasJugadores(token: string): Promise<EstadisticaJugador[]> {
  return rpc('estadisticas_jugadores', { p_token: token })
}

export function misPartidos(token: string): Promise<MiPartido[]> {
  return rpc('mis_partidos', { p_token: token })
}
