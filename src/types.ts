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

export type MiPartido = {
  id: number
  fecha: string
  estado: EstadoPartido
  equipo: 'A' | 'B'
  goles_a: number | null
  goles_b: number | null
  resultado: 'ganado' | 'empate' | 'perdido' | null
  mi_promedio: number | null
}

/** Nombre corto para mostrar: el apodo si tiene, si no el nombre de pila. */
export function nombreCorto(j: { nombre: string; apodo?: string | null }): string {
  return j.apodo?.trim() || j.nombre
}
