import { useCallback, useEffect, useMemo, useState } from 'react'
import { estadisticasJugadores } from '@/lib/api'
import { formatearPromedio } from '@/lib/formato'
import { nombreCorto, type EstadisticaJugador, type Sesion } from '@/types'

type EstadisticasProps = {
  sesion: Sesion
}

/** Puntos del torneo: ganar vale 3, empatar 1, perder 0. */
const PUNTOS_GANADO = 3
const PUNTOS_EMPATADO = 1

/**
 * Cuántos partidos de «crédito» al promedio del grupo se le suman a cada
 * jugador en el KPI ajustado. Con K = 5, alguien con un solo partido pesa
 * 1/6 de su propio rendimiento y 5/6 del promedio general: así el que ganó
 * su único partido no queda primero con una efectividad del 100%.
 */
const K_POR_DEFECTO = 5
const CLAVE_K = 'futbol.estadisticas.k'

/** Una fila del ranking: lo que vino de la base más lo derivado. */
type FilaRanking = EstadisticaJugador & {
  puntos: number
  /** Puntos por partido. null si todavía no jugó. */
  ppg: number | null
  /** PPG corregido con el promedio del grupo. null si todavía no jugó. */
  kpi: number | null
}

const COLUMNAS = [
  { clave: 'partidos_jugados', titulo: 'Partidos' },
  { clave: 'partidos_ganados', titulo: 'Ganados' },
  { clave: 'partidos_empatados', titulo: 'Empatados' },
  { clave: 'partidos_perdidos', titulo: 'Perdidos' },
  { clave: 'puntos', titulo: 'Puntos' },
  { clave: 'kpi', titulo: 'KPI ajustado' },
  { clave: 'promedio_general', titulo: 'Promedio' },
] as const

type ClaveOrden = (typeof COLUMNAS)[number]['clave'] | 'nombre'

/**
 * Tabla del grupo: cada jugador con su historial de partidos. Cuenta solo las
 * fechas finalizadas con resultado cargado; las programadas o en curso no
 * suman para nadie.
 */
export default function Estadisticas({ sesion }: EstadisticasProps) {
  const [filas, setFilas] = useState<EstadisticaJugador[]>([])
  const [error, setError] = useState<string | null>(null)
  const [cargando, setCargando] = useState(true)
  const [orden, setOrden] = useState<ClaveOrden>('kpi')
  const [descendente, setDescendente] = useState(true)
  const [kTexto, setKTexto] = useState(
    () => localStorage.getItem(CLAVE_K) ?? String(K_POR_DEFECTO),
  )

  // Vacío o basura cuentan como 0: sin corrección, el KPI es el PPG crudo.
  const k = Math.max(0, Number(kTexto) || 0)

  useEffect(() => {
    localStorage.setItem(CLAVE_K, String(k))
  }, [k])

  const cargar = useCallback(async () => {
    setCargando(true)
    setError(null)
    try {
      setFilas(await estadisticasJugadores(sesion.token))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron cargar las estadísticas.')
    } finally {
      setCargando(false)
    }
  }, [sesion.token])

  useEffect(() => {
    void cargar()
  }, [cargar])

  const { ranking, ppgGrupo, totales } = useMemo(() => {
    const puntosDe = (f: EstadisticaJugador) =>
      f.partidos_ganados * PUNTOS_GANADO + f.partidos_empatados * PUNTOS_EMPATADO

    const totalJugados = filas.reduce((t, f) => t + f.partidos_jugados, 0)
    const totalPuntos = filas.reduce((t, f) => t + puntosDe(f), 0)

    // El PPG del grupo sale de los totales, no del promedio de los promedios:
    // así cada partido pesa igual, y no más el de quien jugó menos veces.
    const ppgGrupo = totalJugados > 0 ? totalPuntos / totalJugados : null

    const ranking: FilaRanking[] = filas.map(f => {
      const puntos = puntosDe(f)
      const pj = f.partidos_jugados
      const ppg = pj > 0 ? puntos / pj : null
      return {
        ...f,
        puntos,
        ppg,
        kpi:
          ppg === null || ppgGrupo === null
            ? null
            : (pj / (pj + k)) * ppg + (k / (pj + k)) * ppgGrupo,
      }
    })

    return {
      ranking,
      ppgGrupo,
      totales: {
        conPartidos: filas.filter(f => f.partidos_jugados > 0).length,
        jugados: totalJugados,
        puntos: totalPuntos,
        ganados: filas.reduce((t, f) => t + f.partidos_ganados, 0),
        empatados: filas.reduce((t, f) => t + f.partidos_empatados, 0),
        perdidos: filas.reduce((t, f) => t + f.partidos_perdidos, 0),
      },
    }
  }, [filas, k])

  const ordenadas = useMemo(() => {
    const signo = descendente ? -1 : 1
    return [...ranking].sort((a, b) => {
      if (orden === 'nombre') {
        return signo * nombreCorto(a).localeCompare(nombreCorto(b), 'es')
      }
      // Sin dato (nunca jugó, o nadie lo puntuó) va al final, ordene como ordene.
      const va = a[orden]
      const vb = b[orden]
      if (va === null) return 1
      if (vb === null) return -1
      if (va !== vb) return signo * (Number(va) - Number(vb))
      return nombreCorto(a).localeCompare(nombreCorto(b), 'es')
    })
  }, [ranking, orden, descendente])

  function ordenarPor(clave: ClaveOrden) {
    if (clave === orden) {
      setDescendente(d => !d)
      return
    }
    setOrden(clave)
    // Los números arrancan de mayor a menor; los nombres, alfabético.
    setDescendente(clave !== 'nombre')
  }

  if (cargando) return <p className="text-slate-400">Cargando…</p>

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white">Estadísticas</h1>
        <p className="mt-2 text-sm text-slate-400">
          Historial de cada jugador sobre las fechas finalizadas. Tocá el título de una columna
          para ordenar por ella.
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

      {filas.length === 0 ? (
        <p className="rounded-xl border border-white/10 bg-white/5 p-6 text-sm text-slate-400">
          Todavía no hay jugadores cargados.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Tarjeta titulo="Jugadores" valor={filas.length} />
            <Tarjeta titulo="Con fechas jugadas" valor={totales.conPartidos} />
            <Tarjeta titulo="PPG del grupo" valor={formatearPromedio(ppgGrupo)} />
            <Tarjeta
              titulo="Empates / derrotas"
              valor={`${totales.empatados} / ${totales.perdidos}`}
            />
          </div>

          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-5 py-4">
            <label className="flex items-center gap-2 text-sm text-slate-300">
              <span className="font-medium">K</span>
              <input
                type="number"
                min={0}
                step={1}
                value={kTexto}
                onChange={e => setKTexto(e.target.value)}
                className="w-20 rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-center text-white outline-none transition focus:border-emerald-400/60"
              />
            </label>
            <p className="text-sm text-slate-400">
              Partidos de «crédito» que se le suman a cada jugador al promedio del grupo. Más
              alto = más castigo a quien jugó pocas fechas. Con 0, el KPI es el PPG crudo.
            </p>
            {k !== K_POR_DEFECTO && (
              <button
                onClick={() => setKTexto(String(K_POR_DEFECTO))}
                className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-slate-300 transition hover:border-white/30 hover:text-white"
              >
                Volver a {K_POR_DEFECTO}
              </button>
            )}
          </div>

          <div className="overflow-x-auto rounded-xl border border-white/10">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-white/5">
                  <Encabezado
                    titulo="Jugador"
                    activo={orden === 'nombre'}
                    descendente={descendente}
                    onClick={() => ordenarPor('nombre')}
                    alineado="left"
                  />
                  {COLUMNAS.map(c => (
                    <Encabezado
                      key={c.clave}
                      titulo={c.titulo}
                      activo={orden === c.clave}
                      descendente={descendente}
                      onClick={() => ordenarPor(c.clave)}
                    />
                  ))}
                </tr>
              </thead>

              <tbody>
                {ordenadas.map(f => (
                  <tr
                    key={f.jugador_id}
                    className={`border-t border-white/5 ${
                      f.jugador_id === sesion.jugadorId ? 'bg-emerald-500/5' : ''
                    }`}
                  >
                    <td className="px-4 py-2.5">
                      <span className="text-white">{nombreCorto(f)}</span>
                      <span className="ml-2 text-slate-500">{f.apellido}</span>
                      {f.jugador_id === sesion.jugadorId && (
                        <span className="ml-2 rounded border border-emerald-500/40 px-1.5 py-0.5 text-xs text-emerald-300">
                          vos
                        </span>
                      )}
                      {!f.activo && (
                        <span className="ml-2 rounded border border-white/15 px-1.5 py-0.5 text-xs text-slate-500">
                          inactivo
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-center font-mono text-white">
                      {f.partidos_jugados}
                    </td>
                    <td className="px-3 py-2.5 text-center font-mono text-emerald-300">
                      {f.partidos_ganados}
                    </td>
                    <td className="px-3 py-2.5 text-center font-mono text-slate-300">
                      {f.partidos_empatados}
                    </td>
                    <td className="px-3 py-2.5 text-center font-mono text-red-300">
                      {f.partidos_perdidos}
                    </td>
                    <td className="px-3 py-2.5 text-center font-mono font-semibold text-white">
                      {f.puntos}
                    </td>
                    <td
                      className="px-3 py-2.5 text-center font-mono font-semibold text-emerald-300"
                      title={
                        f.ppg === null
                          ? 'Todavía no jugó ninguna fecha finalizada'
                          : `PPG propio ${f.ppg.toFixed(2)} · PPG del grupo ${formatearPromedio(ppgGrupo)} · K ${k}`
                      }
                    >
                      {formatearPromedio(f.kpi)}
                    </td>
                    <td className="px-3 py-2.5 text-center font-mono text-slate-300">
                      {formatearPromedio(f.promedio_general)}
                    </td>
                  </tr>
                ))}
              </tbody>

              <tfoot>
                <tr className="border-t border-white/15 bg-white/5 text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-4 py-2 text-left font-medium">Total</th>
                  <td className="px-3 py-2 text-center font-mono">{totales.jugados}</td>
                  <td className="px-3 py-2 text-center font-mono">{totales.ganados}</td>
                  <td className="px-3 py-2 text-center font-mono">{totales.empatados}</td>
                  <td className="px-3 py-2 text-center font-mono">{totales.perdidos}</td>
                  <td className="px-3 py-2 text-center font-mono">{totales.puntos}</td>
                  <td className="px-3 py-2 text-center font-mono" title="PPG del grupo">
                    {formatearPromedio(ppgGrupo)}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="space-y-1 text-xs text-slate-500">
            <p>
              <strong className="text-slate-400">Puntos</strong>: ganado {PUNTOS_GANADO}, empatado{' '}
              {PUNTOS_EMPATADO}, perdido 0. Los empates cuentan para los dos equipos, así que una
              fecha empatada reparte {PUNTOS_EMPATADO * 10} puntos.
            </p>
            <p>
              <strong className="text-slate-400">KPI ajustado</strong> = (PJ / (PJ + K)) × PPG + (K
              / (PJ + K)) × PPG del grupo, con PPG = Puntos / PJ. Corre el rendimiento de cada uno
              hacia el promedio del grupo en proporción a lo poco que jugó, así una efectividad del
              100% en un solo partido no gana el ranking. Con muchas fechas encima, el KPI tiende
              al PPG propio.
            </p>
            <p>
              <strong className="text-slate-400">Promedio</strong>: el de los puntajes que recibió
              el jugador en su historia, aparte del resultado de los partidos.
            </p>
          </div>
        </>
      )}
    </div>
  )
}

function Encabezado({
  titulo,
  activo,
  descendente,
  onClick,
  alineado = 'center',
}: {
  titulo: string
  activo: boolean
  descendente: boolean
  onClick: () => void
  alineado?: 'left' | 'center'
}) {
  return (
    <th
      className={`px-3 py-2 ${alineado === 'left' ? 'pl-4 text-left' : 'text-center'}`}
      aria-sort={activo ? (descendente ? 'descending' : 'ascending') : 'none'}
    >
      <button
        onClick={onClick}
        className={`text-xs font-medium uppercase tracking-wide transition hover:text-white ${
          activo ? 'text-emerald-300' : 'text-slate-400'
        }`}
      >
        {titulo}
        <span className="ml-1" aria-hidden>
          {activo ? (descendente ? '↓' : '↑') : ''}
        </span>
      </button>
    </th>
  )
}

function Tarjeta({ titulo, valor }: { titulo: string; valor: string | number }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
      <p className="text-xs uppercase tracking-wide text-slate-400">{titulo}</p>
      <p className="mt-1.5 text-2xl font-bold text-white">{valor}</p>
    </div>
  )
}
