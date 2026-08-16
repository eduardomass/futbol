import type { Sesion } from '@/types'

const CLAVE = 'futbol.sesion'

export function leerSesion(): Sesion | null {
  const crudo = localStorage.getItem(CLAVE)
  if (!crudo) return null
  try {
    return JSON.parse(crudo) as Sesion
  } catch {
    localStorage.removeItem(CLAVE)
    return null
  }
}

export function guardarSesion(sesion: Sesion) {
  localStorage.setItem(CLAVE, JSON.stringify(sesion))
}

export function borrarSesion() {
  localStorage.removeItem(CLAVE)
}
