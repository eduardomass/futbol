export type Sesion = {
  token: string
  jugadorId: number | null
  nombre: string
  esAdmin: boolean
}

export type Jugador = {
  id: number
  nombre: string
  apellido: string
  apodo: string | null
  email: string
  activo: boolean
  es_admin: boolean
}

/** Una celda de la grilla de puntajes: qué puso `autor_id` sobre `jugador_id`. */
export type CeldaPuntaje = {
  autor_id: number
  jugador_id: number
  puntaje: number | null
}

export type EstadoPartido = 'programado' | 'en_curso' | 'finalizado'

export type PartidoResumen = {
  id: number
  fecha: string
  estado: EstadoPartido
  goles_a: number | null
  goles_b: number | null
  jugadores: number
  promedio: number | null
}

export type PartidoDetalle = {
  id: number
  fecha: string
  estado: EstadoPartido
  goles_a: number | null
  goles_b: number | null
  promedio_fecha: number | null
  soy_participante: boolean
  ya_puntue: boolean
  /** true cuando ya existe una fecha posterior: el formulario de puntajes se cierra. */
  puntajes_cerrados: boolean
}

export type PlantelItem = {
  jugador_id: number
  nombre: string
  apellido: string
  apodo: string | null
  equipo: 'A' | 'B'
  promedio: number | null
  votos: number
}

export type Estadisticas = {
  partidos_jugados: number
  partidos_ganados: number
  partidos_empatados: number
  partidos_perdidos: number
  promedio_general: number | null
}

/** Una fila del módulo de estadísticas: el historial completo de un jugador. */
export type EstadisticaJugador = {
  jugador_id: number
  nombre: string
  apellido: string
  apodo: string | null
  activo: boolean
  partidos_jugados: number
  partidos_ganados: number
  partidos_empatados: number
  partidos_perdidos: number
  promedio_general: number | null
}

export type MiPartido = {
  id: number
  fecha: string
  estado: EstadoPartido
  equipo: 'A' | 'B'
  goles_a: number | null
  goles_b: number | null
  resultado: 'ganado' | 'empate' | 'perdido' | null
  mi_promedio: number | null
  /** Si el jugador ya cargó sus puntajes de esa fecha. */
  ya_puntue: boolean
}

/** Nombre corto para mostrar: el apodo si tiene, si no el nombre de pila. */
export function nombreCorto(j: { nombre: string; apodo?: string | null }): string {
  return j.apodo?.trim() || j.nombre
}
