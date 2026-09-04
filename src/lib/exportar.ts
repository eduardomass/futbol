import type { CellObject } from 'write-excel-file/browser'
import { ETIQUETA_ESTADO } from './formato'
import { nombreCorto } from '@/types'
import type { FilaExportacion, PartidoResumen } from '@/types'

/**
 * Armado del Excel de la pantalla de partidos: cómo fueron los equipos en cada
 * fecha, una fila por (fecha, jugador). Los datos los trae `exportarPlanteles`;
 * acá solo se eligen las columnas y se le da formato.
 *
 * Las columnas se prenden y apagan desde la pantalla, y no son un adorno: la
 * planilla que se comparte con el grupo no es la misma que la que se usa para
 * mirar promedios.
 */
export type OpcionesExportacion = {
  /** Una primera hoja con una fila por fecha: marcador, ganador, promedio. */
  resumen: boolean
  /** Los goles que hizo cada jugador en esa fecha. */
  goles: boolean
  /** El promedio que recibió y cuántos lo puntuaron. */
  puntajes: boolean
  /** Los `mejores` / `peores` de la planilla y el título de la fecha. */
  destacados: boolean
}

export const OPCIONES_POR_DEFECTO: OpcionesExportacion = {
  resumen: true,
  goles: true,
  puntajes: true,
  destacados: false,
}

const ETIQUETA_RESULTADO: Record<string, string> = {
  ganado: 'Ganó',
  empate: 'Empató',
  perdido: 'Perdió',
}

const ENCABEZADO = {
  fontWeight: 'bold',
  backgroundColor: '#E2E8F0',
  borderStyle: 'thin',
  borderColor: '#94A3B8',
  align: 'center',
} as const

/** Sombreado alterno por fecha, para que cada partido se lea como un bloque. */
const BANDA = { backgroundColor: '#F1F5F9' } as const

/**
 * `numeric` de Postgres llega como string por PostgREST, así que nada de
 * confiar en el tipo declarado: los promedios pasan por acá antes de ir a una
 * celda numérica.
 */
function aNumero(valor: number | string | null | undefined): number | null {
  if (valor === null || valor === undefined || valor === '') return null
  const n = Number(valor)
  return Number.isFinite(n) ? n : null
}

/**
 * La fecha del partido es un `date` sin zona horaria: se arma en UTC a
 * propósito. Con `new Date(anio, mes, dia)` el serial de Excel sale corrido y
 * en cualquier huso al este de Greenwich la planilla muestra el día anterior.
 */
function aFecha(fecha: string): Date {
  const [anio, mes, dia] = fecha.split('-').map(Number)
  return new Date(Date.UTC(anio, mes - 1, dia))
}

function marcador(golesA: number | null, golesB: number | null): string | null {
  if (golesA === null || golesB === null) return null
  return `${golesA} - ${golesB}`
}

function ganador(golesA: number | null, golesB: number | null): string | null {
  if (golesA === null || golesB === null) return null
  if (golesA === golesB) return 'Empate'
  return golesA > golesB ? 'Equipo A' : 'Equipo B'
}

function titulo(fila: FilaExportacion): string | null {
  const titulos = [fila.es_mvp && 'Jugador del partido', fila.es_wvp && 'Peor del partido']
  return titulos.filter(Boolean).join(' / ') || null
}

const texto = (valor: string | null): CellObject | null =>
  valor === null ? null : { value: valor, type: String }

const numero = (valor: number | null, format?: string): CellObject | null =>
  valor === null ? null : { value: valor, type: Number, format, align: 'center' }

type Columna<T> = {
  titulo: string
  ancho: number
  celda: (item: T) => CellObject | null
}

/** Deja solo las columnas prendidas: un `false` en la lista se descarta. */
function columnas<T>(defs: (Columna<T> | false)[]): Columna<T>[] {
  return defs.filter((c): c is Columna<T> => c !== false)
}

function hoja<T>(nombre: string, defs: Columna<T>[], items: T[], banda: (item: T) => boolean) {
  const encabezado: CellObject[] = defs.map(c => ({ value: c.titulo, type: String, ...ENCABEZADO }))
  const filas: CellObject[][] = items.map(item => {
    const fondo = banda(item) ? BANDA : {}
    return defs.map(c => {
      const celda = c.celda(item)
      return celda === null ? { ...fondo } : { ...celda, ...fondo }
    })
  })

  return {
    sheet: nombre,
    dateFormat: 'dd/mm/yyyy',
    columns: defs.map(c => ({ width: c.ancho })),
    data: [encabezado, ...filas],
  }
}

function nombreArchivo(fechas: string[]): string {
  if (fechas.length === 0) return 'equipos.xlsx'
  const ordenadas = [...fechas].sort()
  const desde = ordenadas[0]
  const hasta = ordenadas[ordenadas.length - 1]
  return desde === hasta ? `equipos-${desde}.xlsx` : `equipos-${desde}-a-${hasta}.xlsx`
}

/**
 * Genera el archivo y dispara la descarga en el navegador. `partidos` son las
 * fechas elegidas —se usan para la hoja resumen, que muestra también las que
 * todavía no tienen plantel— y `filas` es lo que devolvió `exportarPlanteles`.
 */
export async function exportarAExcel(
  partidos: PartidoResumen[],
  filas: FilaExportacion[],
  opciones: OpcionesExportacion,
): Promise<void> {
  // El sombreado alterna por fecha, no por fila: hay que saber en qué orden
  // aparecieron las fechas dentro del listado ya ordenado que vino de la base.
  const orden = new Map<number, number>()
  for (const fila of filas) {
    if (!orden.has(fila.partido_id)) orden.set(fila.partido_id, orden.size)
  }
  const bandaPorFecha = (id: number) => (orden.get(id) ?? 0) % 2 === 1

  const equipos = hoja(
    'Equipos',
    columnas<FilaExportacion>([
      { titulo: 'Fecha', ancho: 12, celda: f => ({ value: aFecha(f.fecha), type: Date }) },
      { titulo: 'Estado', ancho: 12, celda: f => texto(ETIQUETA_ESTADO[f.estado] ?? f.estado) },
      { titulo: 'Marcador', ancho: 10, celda: f => texto(marcador(f.goles_a, f.goles_b)) },
      { titulo: 'Equipo', ancho: 8, celda: f => texto(f.equipo) },
      { titulo: 'Jugador', ancho: 16, celda: f => texto(nombreCorto(f)) },
      { titulo: 'Apellido', ancho: 16, celda: f => texto(f.apellido) },
      opciones.goles && { titulo: 'Goles', ancho: 8, celda: f => numero(f.goles) },
      {
        titulo: 'Resultado',
        ancho: 11,
        celda: f => texto(f.resultado ? ETIQUETA_RESULTADO[f.resultado] : null),
      },
      opciones.puntajes && {
        titulo: 'Promedio',
        ancho: 10,
        celda: f => numero(aNumero(f.promedio), '0.00'),
      },
      opciones.puntajes && { titulo: 'Votos', ancho: 8, celda: f => numero(f.votos) },
      opciones.destacados && { titulo: 'Mejores', ancho: 9, celda: f => numero(f.mejores) },
      opciones.destacados && { titulo: 'Peores', ancho: 9, celda: f => numero(f.peores) },
      opciones.destacados && { titulo: 'Título', ancho: 20, celda: f => texto(titulo(f)) },
    ]),
    filas,
    f => bandaPorFecha(f.partido_id),
  )

  const hojas = [equipos]

  if (opciones.resumen) {
    const porFecha = new Map<number, FilaExportacion[]>()
    for (const fila of filas) {
      const lista = porFecha.get(fila.partido_id)
      if (lista) lista.push(fila)
      else porFecha.set(fila.partido_id, [fila])
    }
    const destacadosDe = (id: number, cual: 'es_mvp' | 'es_wvp') => {
      const nombres = (porFecha.get(id) ?? []).filter(f => f[cual]).map(nombreCorto)
      return nombres.length > 0 ? nombres.join(', ') : null
    }

    const resumen = hoja(
      'Fechas',
      columnas<PartidoResumen>([
        { titulo: 'Fecha', ancho: 12, celda: p => ({ value: aFecha(p.fecha), type: Date }) },
        { titulo: 'Estado', ancho: 12, celda: p => texto(ETIQUETA_ESTADO[p.estado] ?? p.estado) },
        { titulo: 'Marcador', ancho: 10, celda: p => texto(marcador(p.goles_a, p.goles_b)) },
        { titulo: 'Ganador', ancho: 12, celda: p => texto(ganador(p.goles_a, p.goles_b)) },
        { titulo: 'Jugadores', ancho: 11, celda: p => numero(p.jugadores) },
        opciones.puntajes && {
          titulo: 'Promedio fecha',
          ancho: 15,
          celda: p => numero(aNumero(p.promedio), '0.00'),
        },
        opciones.destacados && {
          titulo: 'Jugador del partido',
          ancho: 24,
          celda: p => texto(destacadosDe(p.id, 'es_mvp')),
        },
        opciones.destacados && {
          titulo: 'Peor del partido',
          ancho: 24,
          celda: p => texto(destacadosDe(p.id, 'es_wvp')),
        },
      ]),
      partidos,
      () => false,
    )

    hojas.unshift(resumen)
  }

  // El armado del .xlsx se carga recién acá: es la única parte de la app que
  // necesita la librería, y son ~50 kB que no tienen por qué estar en el
  // bundle de todos los que nunca exportan.
  const { default: writeXlsxFile } = await import('write-excel-file/browser')

  await writeXlsxFile(hojas).toFile(nombreArchivo(partidos.map(p => p.fecha)))
}
