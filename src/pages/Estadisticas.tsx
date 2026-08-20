import { useCallback, useEffect, useMemo, useState } from 'react'
import { estadisticasJugadores } from '@/lib/api'
import { formatearPromedio } from '@/lib/formato'
import { nombreCorto, type EstadisticaJugador, type Sesion } from '@/types'

type EstadisticasProps = {
  sesion: Sesion
}

/** Las columnas ordenables y cómo sacar el número de cada fila. */
const COLUMNAS = [
  { clave: 'partidos_jugados', titulo: 'Partidos' },
  { clave: 'partidos_ganados', titulo: 'Ganados' },
  { clave: 'partidos_empatados', titulo: 'Empatados' },
  { clave: 'partidos_perdidos', titulo: 'Perdidos' },
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
  const [orden, setOrden] = useState<ClaveOrden>('partidos_ganados')
  const [descendente, setDescendente] = useState(true)

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

  const ordenadas = useMemo(() => {
    const signo = descendente ? -1 : 1
    return [...filas].sort((a, b) => {
      if (orden === 'nombre') {
        return signo * nombreCorto(a).localeCompare(nombreCorto(b), 'es')
      }
      // Sin promedio va siempre al final, ordene como ordene.
      const va = a[orden]
      const vb = b[orden]
      if (va === null) return 1
      if (vb === null) return -1
      if (va !== vb) return signo * (Number(va) - Number(vb))
      return nombreCorto(a).localeCompare(nombreCorto(b), 'es')
    })
  }, [filas, orden, descendente])

  const totales = useMemo(
    () => ({
      jugadores: filas.filter(f => f.partidos_jugados > 0).length,
      jugados: filas.reduce((t, f) => t + f.partidos_jugados, 0),
      ganados: filas.reduce((t, f) => t + f.partidos_ganados, 0),
      empatados: filas.reduce((t, f) => t + f.partidos_empatados, 0),
      perdidos: filas.reduce((t, f) => t + f.partidos_perdidos, 0),
    }),
    [filas],
  )

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
            <Tarjeta titulo="Con fechas jugadas" valor={totales.jugadores} />
            <Tarjeta titulo="Victorias cargadas" valor={totales.ganados} />
            <Tarjeta titulo="Empates / derrotas" valor={`${totales.empatados} / ${totales.perdidos}`} />
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
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>

          <p className="text-xs text-slate-500">
            Los empates cuentan para los dos equipos, así que en una fecha empatada suman 10
            empates. El promedio es el de todos los puntajes que recibió el jugador en su
            historia.
          </p>
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
