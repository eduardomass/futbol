import { useCallback, useEffect, useMemo, useState } from 'react'
import { guardarGrillaPuntajes, matrizPuntajes } from '@/lib/api'
import { formatearPromedio } from '@/lib/formato'
import { nombreCorto, type CeldaPuntaje, type PlantelItem, type Sesion } from '@/types'

type GrillaPuntajesProps = {
  sesion: Sesion
  partidoId: number
  plantel: PlantelItem[]
  onGuardado: () => void
}

const clave = (autorId: number, jugadorId: number) => `${autorId}-${jugadorId}`

/**
 * Planilla autor × jugador. Cada fila es quien opina, cada columna el jugador
 * puntuado, y la celda el puntaje. Solo la ve un administrador: para el resto,
 * los votos de los demás son privados.
 */
export default function GrillaPuntajes({
  sesion,
  partidoId,
  plantel,
  onGuardado,
}: GrillaPuntajesProps) {
  const [valores, setValores] = useState<Record<string, string>>({})
  const [originales, setOriginales] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)

  const cargar = useCallback(async () => {
    setCargando(true)
    try {
      const celdas = await matrizPuntajes(sesion.token, partidoId)
      const mapa: Record<string, string> = {}
      for (const c of celdas) {
        mapa[clave(c.autor_id, c.jugador_id)] = c.puntaje === null ? '' : String(Number(c.puntaje))
      }
      setValores(mapa)
      setOriginales(mapa)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar la grilla.')
    } finally {
      setCargando(false)
    }
  }, [sesion.token, partidoId])

  useEffect(() => {
    void cargar()
  }, [cargar])

  const cambios = useMemo(
    () =>
      Object.keys({ ...valores, ...originales }).filter(
        k => (valores[k] ?? '') !== (originales[k] ?? ''),
      ),
    [valores, originales],
  )

  /** Promedio de una columna: lo que el grupo le puso a ese jugador. */
  function promedioColumna(jugadorId: number): number | null {
    const nums = plantel
      .map(a => valores[clave(a.jugador_id, jugadorId)])
      .filter(v => v !== undefined && v !== '')
      .map(Number)
      .filter(n => !Number.isNaN(n))
    if (nums.length === 0) return null
    return nums.reduce((a, b) => a + b, 0) / nums.length
  }

  /** Cuántas celdas completó ese autor. */
  function completadasPorFila(autorId: number): number {
    return plantel.filter(j => (valores[clave(autorId, j.jugador_id)] ?? '') !== '').length
  }

  async function guardar() {
    setError(null)
    setAviso(null)

    const celdas: CeldaPuntaje[] = []
    for (const k of cambios) {
      const [autorId, jugadorId] = k.split('-').map(Number)
      const crudo = valores[k] ?? ''
      if (crudo === '') {
        celdas.push({ autor_id: autorId, jugador_id: jugadorId, puntaje: null })
        continue
      }
      const n = Number(crudo)
      if (Number.isNaN(n) || n < 1 || n > 10 || n * 2 !== Math.trunc(n * 2)) {
        setError(`«${crudo}» no es un puntaje válido. Van de 1 a 10, de a medio punto.`)
        return
      }
      celdas.push({ autor_id: autorId, jugador_id: jugadorId, puntaje: n })
    }

    setGuardando(true)
    try {
      await guardarGrillaPuntajes(sesion.token, partidoId, celdas)
      setOriginales(valores)
      setAviso(`${celdas.length} ${celdas.length === 1 ? 'celda guardada' : 'celdas guardadas'}.`)
      onGuardado()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar la grilla.')
    } finally {
      setGuardando(false)
    }
  }

  if (cargando) return <p className="text-sm text-slate-400">Cargando grilla…</p>

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-400">
        Cada fila es quien opina y cada columna el jugador puntuado. Podés completar los votos de
        cualquiera. Dejá una celda vacía para borrar ese voto.
      </p>

      <div className="overflow-x-auto rounded-xl border border-white/10">
        <table className="text-sm">
          <thead>
            <tr className="bg-white/5">
              <th className="sticky left-0 z-10 bg-[#0b0f1a] px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate-400">
                Opina ↓ / Puntúa a →
              </th>
              {plantel.map(j => (
                <th
                  key={j.jugador_id}
                  className="px-2 py-2 text-center text-xs font-medium text-slate-300"
                  title={`${j.nombre} ${j.apellido}`}
                >
                  <span
                    className={j.equipo === 'A' ? 'text-sky-300' : 'text-fuchsia-300'}
                  >
                    {nombreCorto(j)}
                  </span>
                </th>
              ))}
              <th className="px-3 py-2 text-center text-xs font-medium uppercase tracking-wide text-slate-500">
                Cargó
              </th>
            </tr>
          </thead>

          <tbody>
            {plantel.map(autor => (
              <tr key={autor.jugador_id} className="border-t border-white/5">
                <th
                  className="sticky left-0 z-10 bg-[#0b0f1a] px-3 py-1.5 text-left font-medium whitespace-nowrap"
                  title={`${autor.nombre} ${autor.apellido}`}
                >
                  <span
                    className={autor.equipo === 'A' ? 'text-sky-300' : 'text-fuchsia-300'}
                  >
                    {nombreCorto(autor)}
                  </span>
                </th>

                {plantel.map(j => {
                  const k = clave(autor.jugador_id, j.jugador_id)
                  const propio = autor.jugador_id === j.jugador_id
                  return (
                    <td key={j.jugador_id} className="px-1 py-1">
                      <input
                        type="number"
                        min={1}
                        max={10}
                        step={0.5}
                        value={valores[k] ?? ''}
                        onChange={e => setValores({ ...valores, [k]: e.target.value })}
                        aria-label={`Puntaje de ${nombreCorto(autor)} a ${nombreCorto(j)}`}
                        className={`w-16 rounded border px-2 py-1 text-center text-white outline-none transition focus:border-emerald-400/70 ${
                          propio
                            ? 'border-emerald-500/30 bg-emerald-500/5'
                            : 'border-white/10 bg-black/30'
                        } ${
                          (valores[k] ?? '') !== (originales[k] ?? '')
                            ? 'ring-1 ring-amber-400/60'
                            : ''
                        }`}
                      />
                    </td>
                  )
                })}

                <td className="px-3 py-1 text-center text-xs text-slate-500">
                  {completadasPorFila(autor.jugador_id)}/{plantel.length}
                </td>
              </tr>
            ))}
          </tbody>

          <tfoot>
            <tr className="border-t border-white/15 bg-white/5">
              <th className="sticky left-0 z-10 bg-[#0b0f1a] px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate-400">
                Promedio
              </th>
              {plantel.map(j => (
                <td
                  key={j.jugador_id}
                  className="px-2 py-2 text-center font-semibold text-emerald-400"
                >
                  {formatearPromedio(promedioColumna(j.jugador_id))}
                </td>
              ))}
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

      {error && (
        <p
          role="alert"
          className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200"
        >
          {error}
        </p>
      )}
      {aviso && (
        <p className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
          {aviso}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={guardar}
          disabled={guardando || cambios.length === 0}
          className="rounded-lg bg-emerald-500 px-5 py-2.5 font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {guardando ? 'Guardando…' : 'Guardar grilla'}
        </button>
        <span className="text-sm text-slate-400">
          {cambios.length === 0
            ? 'Sin cambios pendientes.'
            : `${cambios.length} ${cambios.length === 1 ? 'celda modificada' : 'celdas modificadas'} (marcadas en ámbar).`}
        </span>
        {cambios.length > 0 && (
          <button
            onClick={() => {
              setValores(originales)
              setError(null)
            }}
            className="text-sm text-slate-400 underline-offset-4 hover:text-white hover:underline"
          >
            Descartar cambios
          </button>
        )}
      </div>
    </div>
  )
}
