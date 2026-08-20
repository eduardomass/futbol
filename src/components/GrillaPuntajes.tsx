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
 * El orden de las columnas es una preferencia de quien carga, no un dato del
 * partido: se guarda por partido en el navegador para no tener que reordenar
 * cada vez que se vuelve a entrar.
 */
const claveOrden = (partidoId: number) => `futbol.grilla.orden.${partidoId}`

function leerOrden(partidoId: number): number[] {
  try {
    const crudo = localStorage.getItem(claveOrden(partidoId))
    if (!crudo) return []
    const ids = JSON.parse(crudo)
    return Array.isArray(ids) ? ids.filter((x): x is number => typeof x === 'number') : []
  } catch {
    return []
  }
}

const mismoOrden = (a: number[], b: number[]) =>
  a.length === b.length && a.every((x, i) => x === b[i])

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
  const [orden, setOrden] = useState<number[]>(() => leerOrden(partidoId))
  const [arrastrando, setArrastrando] = useState<number | null>(null)
  const [sobre, setSobre] = useState<number | null>(null)

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

  // El orden guardado puede haber quedado viejo: un jugador que salió del
  // plantel se descarta y uno nuevo se agrega al final.
  useEffect(() => {
    const ids = plantel.map(p => p.jugador_id)
    setOrden(previo => {
      const base = previo.length > 0 ? previo : leerOrden(partidoId)
      const vigentes = base.filter(id => ids.includes(id))
      const siguiente = [...vigentes, ...ids.filter(id => !vigentes.includes(id))]
      return mismoOrden(previo, siguiente) ? previo : siguiente
    })
  }, [plantel, partidoId])

  useEffect(() => {
    if (orden.length === 0) return
    localStorage.setItem(claveOrden(partidoId), JSON.stringify(orden))
  }, [orden, partidoId])

  /** El plantel en el orden elegido para las columnas. */
  const columnas = useMemo(
    () =>
      orden
        .map(id => plantel.find(p => p.jugador_id === id))
        .filter((p): p is PlantelItem => p !== undefined),
    [orden, plantel],
  )

  const ordenOriginal = mismoOrden(
    orden,
    plantel.map(p => p.jugador_id),
  )

  /** Mueve una columna de una posición a otra, corriendo el resto. */
  function moverColumna(desde: number, hasta: number) {
    if (desde === hasta || hasta < 0 || hasta >= orden.length) return
    setOrden(previo => {
      const copia = [...previo]
      const [id] = copia.splice(desde, 1)
      copia.splice(hasta, 0, id)
      return copia
    })
  }

  function restablecerOrden() {
    localStorage.removeItem(claveOrden(partidoId))
    setOrden(plantel.map(p => p.jugador_id))
  }

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
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-2xl text-sm text-slate-400">
          Cada fila es quien opina y cada columna el jugador puntuado. Podés completar los votos de
          cualquiera. Dejá una celda vacía para borrar ese voto.
          <br />
          Para cargar más cómodo, las columnas se pueden mover: arrastrá el nombre, o usá las
          flechas ‹ › debajo de cada uno. El orden queda guardado en este navegador.
        </p>
        {!ordenOriginal && (
          <button
            onClick={restablecerOrden}
            className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-slate-300 transition hover:border-white/30 hover:text-white"
          >
            Restablecer orden
          </button>
        )}
      </div>

      <div className="overflow-x-auto rounded-xl border border-white/10">
        <table className="text-sm">
          <thead>
            <tr className="bg-white/5">
              <th className="sticky left-0 z-10 bg-[#0b0f1a] px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate-400">
                Opina ↓ / Puntúa a →
              </th>
              {columnas.map((j, i) => (
                <th
                  key={j.jugador_id}
                  draggable
                  onDragStart={() => setArrastrando(i)}
                  onDragOver={e => {
                    e.preventDefault()
                    setSobre(i)
                  }}
                  onDragLeave={() => setSobre(s => (s === i ? null : s))}
                  onDrop={e => {
                    e.preventDefault()
                    if (arrastrando !== null) moverColumna(arrastrando, i)
                    setArrastrando(null)
                    setSobre(null)
                  }}
                  onDragEnd={() => {
                    setArrastrando(null)
                    setSobre(null)
                  }}
                  className={`cursor-grab select-none px-2 py-2 text-center text-xs font-medium text-slate-300 ${
                    arrastrando === i ? 'opacity-40' : ''
                  } ${
                    sobre === i && arrastrando !== null && arrastrando !== i
                      ? 'bg-emerald-500/15'
                      : ''
                  }`}
                  title={`${j.nombre} ${j.apellido} — arrastrá para mover la columna`}
                >
                  <span className={j.equipo === 'A' ? 'text-sky-300' : 'text-fuchsia-300'}>
                    {nombreCorto(j)}
                  </span>
                  <span className="mt-1 flex items-center justify-center gap-0.5">
                    <BotonMover
                      hacia="izquierda"
                      jugador={nombreCorto(j)}
                      disabled={i === 0}
                      onClick={() => moverColumna(i, i - 1)}
                    />
                    <span aria-hidden className="text-[10px] leading-none text-slate-600">
                      ⠿
                    </span>
                    <BotonMover
                      hacia="derecha"
                      jugador={nombreCorto(j)}
                      disabled={i === columnas.length - 1}
                      onClick={() => moverColumna(i, i + 1)}
                    />
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

                {columnas.map(j => {
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
              {columnas.map(j => (
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

/** Flechita para mover una columna sin arrastrar: sirve en teclado y en celular. */
function BotonMover({
  hacia,
  jugador,
  disabled,
  onClick,
}: {
  hacia: 'izquierda' | 'derecha'
  jugador: string
  disabled: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-label={`Mover la columna de ${jugador} a la ${hacia}`}
      className="rounded px-1 leading-none text-slate-500 transition hover:bg-white/10 hover:text-white disabled:opacity-20 disabled:hover:bg-transparent"
    >
      {hacia === 'izquierda' ? '‹' : '›'}
    </button>
  )
}
