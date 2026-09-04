import { useState } from 'react'
import { exportarPlanteles } from '@/lib/api'
import { COLOR_ESTADO, ETIQUETA_ESTADO, formatearFechaCorta } from '@/lib/formato'
import { exportarAExcel, OPCIONES_POR_DEFECTO } from '@/lib/exportar'
import type { OpcionesExportacion } from '@/lib/exportar'
import type { PartidoResumen } from '@/types'

type ExportarPartidosProps = {
  token: string
  partidos: PartidoResumen[]
}

const DATOS: { clave: keyof OpcionesExportacion; etiqueta: string; ayuda: string }[] = [
  {
    clave: 'resumen',
    etiqueta: 'Hoja resumen de fechas',
    ayuda: 'Una fila por fecha: marcador, ganador y promedio.',
  },
  { clave: 'goles', etiqueta: 'Goles de cada jugador', ayuda: 'La columna «Goles».' },
  {
    clave: 'puntajes',
    etiqueta: 'Promedio y votos',
    ayuda: 'Qué puntaje recibió cada uno y cuántos lo puntuaron.',
  },
  {
    clave: 'destacados',
    etiqueta: 'Jugador y peor del partido',
    ayuda: 'Cuántas planillas eligieron a cada uno, y el título de la fecha.',
  },
]

/**
 * El Excel de la pantalla de partidos: cómo fueron los equipos en cada fecha.
 *
 * Se elige qué fechas entran y qué columnas se llevan. La consulta es una sola
 * (`exportarPlanteles`) y el archivo se arma en el navegador, así que apretar
 * el botón no toca nada de la base.
 */
export default function ExportarPartidos({ token, partidos }: ExportarPartidosProps) {
  const [abierto, setAbierto] = useState(false)
  const [elegidas, setElegidas] = useState<Set<number>>(() => new Set(partidos.map(p => p.id)))
  const [opciones, setOpciones] = useState<OpcionesExportacion>(OPCIONES_POR_DEFECTO)
  const [generando, setGenerando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [listo, setListo] = useState<string | null>(null)

  const seleccionados = partidos.filter(p => elegidas.has(p.id))

  function alternar(id: number) {
    setElegidas(previas => {
      const proximas = new Set(previas)
      if (proximas.has(id)) proximas.delete(id)
      else proximas.add(id)
      return proximas
    })
    setListo(null)
  }

  function elegir(ids: number[]) {
    setElegidas(new Set(ids))
    setListo(null)
  }

  async function descargar() {
    setGenerando(true)
    setError(null)
    setListo(null)
    try {
      const filas = await exportarPlanteles(
        token,
        seleccionados.map(p => p.id),
      )

      if (filas.length === 0 && !opciones.resumen) {
        setError(
          'Las fechas elegidas todavía no tienen plantel cargado, así que el archivo saldría vacío. ' +
            'Elegí otras fechas o agregá la hoja resumen.',
        )
        return
      }

      await exportarAExcel(seleccionados, filas, opciones)
      setListo(
        `Listo: ${seleccionados.length} ${seleccionados.length === 1 ? 'fecha' : 'fechas'} y ` +
          `${filas.length} ${filas.length === 1 ? 'jugador' : 'jugadores'} en el archivo.`,
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo generar el archivo.')
    } finally {
      setGenerando(false)
    }
  }

  if (partidos.length === 0) return null

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="rounded-lg border border-white/20 px-4 py-2 text-sm text-white transition hover:border-white/40"
      >
        Exportar a Excel
      </button>
    )
  }

  return (
    <section className="space-y-5 rounded-xl border border-white/10 bg-white/5 p-5">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-semibold text-white">Exportar a Excel</h2>
        <button
          type="button"
          onClick={() => setAbierto(false)}
          className="ml-auto text-sm text-slate-400 transition hover:text-slate-200"
        >
          Cerrar
        </button>
      </div>

      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-medium text-slate-300">Qué fechas</h3>
          <span className="text-sm text-slate-400">
            ({seleccionados.length} de {partidos.length})
          </span>
          <div className="ml-auto flex gap-2">
            <button
              type="button"
              onClick={() => elegir(partidos.map(p => p.id))}
              className="rounded-md border border-white/15 px-2.5 py-1 text-xs text-slate-300 transition hover:border-white/35"
            >
              Todas
            </button>
            <button
              type="button"
              onClick={() =>
                elegir(partidos.filter(p => p.estado === 'finalizado').map(p => p.id))
              }
              className="rounded-md border border-white/15 px-2.5 py-1 text-xs text-slate-300 transition hover:border-white/35"
            >
              Solo finalizadas
            </button>
            <button
              type="button"
              onClick={() => elegir([])}
              className="rounded-md border border-white/15 px-2.5 py-1 text-xs text-slate-300 transition hover:border-white/35"
            >
              Ninguna
            </button>
          </div>
        </div>

        <ul className="max-h-64 space-y-1 overflow-y-auto rounded-lg border border-white/10 bg-black/20 p-2">
          {partidos.map(p => (
            <li key={p.id}>
              <label className="flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 rounded-md px-2 py-1.5 transition hover:bg-white/5">
                <input
                  type="checkbox"
                  checked={elegidas.has(p.id)}
                  onChange={() => alternar(p.id)}
                  className="size-4 accent-emerald-500"
                />
                <span className="text-sm text-white">{formatearFechaCorta(p.fecha)}</span>
                <span className={`rounded-md border px-1.5 py-0.5 text-xs ${COLOR_ESTADO[p.estado]}`}>
                  {ETIQUETA_ESTADO[p.estado]}
                </span>
                {p.goles_a !== null && (
                  <span className="font-mono text-xs text-slate-300">
                    {p.goles_a} - {p.goles_b}
                  </span>
                )}
                <span className="ml-auto text-xs text-slate-500">{p.jugadores}/10</span>
              </label>
            </li>
          ))}
        </ul>
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-medium text-slate-300">Qué datos</h3>
        <ul className="space-y-2">
          {DATOS.map(dato => (
            <li key={dato.clave}>
              <label className="flex cursor-pointer items-start gap-2.5">
                <input
                  type="checkbox"
                  checked={opciones[dato.clave]}
                  onChange={e => {
                    setOpciones({ ...opciones, [dato.clave]: e.target.checked })
                    setListo(null)
                  }}
                  className="mt-0.5 size-4 accent-emerald-500"
                />
                <span className="text-sm text-slate-200">
                  {dato.etiqueta}
                  <span className="block text-xs text-slate-500">{dato.ayuda}</span>
                </span>
              </label>
            </li>
          ))}
        </ul>
        <p className="text-xs text-slate-500">
          La hoja «Equipos» siempre trae fecha, estado, marcador, equipo, jugador y resultado: es
          cómo quedaron armados los equipos en cada fecha.
        </p>
      </div>

      {error && (
        <p
          role="alert"
          className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200"
        >
          {error}
        </p>
      )}

      {listo && (
        <p className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
          {listo}
        </p>
      )}

      <button
        type="button"
        onClick={() => void descargar()}
        disabled={generando || seleccionados.length === 0}
        className="rounded-lg bg-emerald-500 px-5 py-2.5 font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {generando
          ? 'Generando…'
          : seleccionados.length === 0
            ? 'Elegí al menos una fecha'
            : `Descargar ${seleccionados.length} ${seleccionados.length === 1 ? 'fecha' : 'fechas'}`}
      </button>
    </section>
  )
}
