/** Las fechas de partidos son `date` de Postgres: 'YYYY-MM-DD', sin zona horaria. */
export function formatearFecha(fecha: string): string {
  const [anio, mes, dia] = fecha.split('-').map(Number)
  const d = new Date(anio, mes - 1, dia)
  return d.toLocaleDateString('es-AR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

export function formatearFechaCorta(fecha: string): string {
  const [anio, mes, dia] = fecha.split('-').map(Number)
  return `${String(dia).padStart(2, '0')}/${String(mes).padStart(2, '0')}/${anio}`
}

export function formatearPromedio(promedio: number | null | undefined): string {
  if (promedio === null || promedio === undefined) return '—'
  return Number(promedio).toFixed(2)
}

export const ETIQUETA_ESTADO: Record<string, string> = {
  programado: 'Programado',
  en_curso: 'En curso',
  finalizado: 'Finalizado',
}

export const COLOR_ESTADO: Record<string, string> = {
  programado: 'border-sky-500/40 bg-sky-500/10 text-sky-300',
  en_curso: 'border-amber-500/40 bg-amber-500/10 text-amber-300',
  finalizado: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300',
}
