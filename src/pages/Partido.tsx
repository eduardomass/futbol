import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  agregarJugadorPartido,
  cargarResultado,
  comenzarPartido,
  finalizarPartido,
  guardarPuntajes,
  listarJugadores,
  misPuntajes,
  obtenerPartido,
  plantelPartido,
  quitarJugadorPartido,
} from '@/lib/api'
import { COLOR_ESTADO, ETIQUETA_ESTADO, formatearFecha, formatearPromedio } from '@/lib/formato'
import { nombreCorto, type Jugador, type PartidoDetalle, type PlantelItem, type Sesion } from '@/types'

type PartidoProps = {
  sesion: Sesion
}

/** Escala de 1 a 10 con medios: 1, 1.5, 2, … 10. */
const ESCALA = Array.from({ length: 19 }, (_, i) => 1 + i * 0.5)

export default function Partido({ sesion }: PartidoProps) {
  const { id } = useParams()
  const partidoId = Number(id)

  const [partido, setPartido] = useState<PartidoDetalle | null>(null)
  const [plantel, setPlantel] = useState<PlantelItem[]>([])
  const [disponibles, setDisponibles] = useState<Jugador[]>([])
  const [error, setError] = useState<string | null>(null)
  const [cargando, setCargando] = useState(true)
  const [ocupado, setOcupado] = useState(false)

  const [golesA, setGolesA] = useState('')
  const [golesB, setGolesB] = useState('')
  const [puntajes, setPuntajes] = useState<Record<number, number>>({})
  const [avisoPuntajes, setAvisoPuntajes] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    setCargando(true)
    try {
      const [p, pl, js] = await Promise.all([
        obtenerPartido(sesion.token, partidoId),
        plantelPartido(sesion.token, partidoId),
        listarJugadores(sesion.token),
      ])
      setPartido(p)
      setPlantel(pl)
      const enPartido = new Set(pl.map(x => x.jugador_id))
      setDisponibles(js.filter(j => !enPartido.has(j.id)))
      setGolesA(p?.goles_a?.toString() ?? '')
      setGolesB(p?.goles_b?.toString() ?? '')

      if (p?.estado === 'finalizado' && p.soy_participante) {
        const mios = await misPuntajes(sesion.token, partidoId)
        setPuntajes(Object.fromEntries(mios.map(m => [m.jugador_id, Number(m.puntaje)])))
      }
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar el partido.')
    } finally {
      setCargando(false)
    }
  }, [sesion.token, partidoId])

  useEffect(() => {
    void cargar()
  }, [cargar])

  /** Envuelve una acción: marca ocupado, muestra el error y recarga. */
  async function accion(fn: () => Promise<unknown>) {
    setOcupado(true)
    setError(null)
    try {
      await fn()
      await cargar()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'La acción falló.')
    } finally {
      setOcupado(false)
    }
  }

  const equipoA = useMemo(() => plantel.filter(p => p.equipo === 'A'), [plantel])
  const equipoB = useMemo(() => plantel.filter(p => p.equipo === 'B'), [plantel])
  const completo = equipoA.length === 5 && equipoB.length === 5

  if (cargando) return <p className="text-slate-400">Cargando…</p>

  if (!partido) {
    return (
      <div className="space-y-4">
        <p className="text-slate-400">No se encontró el partido.</p>
        <Link to="/" className="text-emerald-400 hover:underline">
          ← Volver al inicio
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <div>
        <Link to="/" className="text-sm text-slate-400 hover:text-white">
          ← Volver
        </Link>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-bold text-white">{formatearFecha(partido.fecha)}</h1>
          <span className={`rounded-md border px-2.5 py-1 text-xs ${COLOR_ESTADO[partido.estado]}`}>
            {ETIQUETA_ESTADO[partido.estado]}
          </span>
        </div>
        {partido.goles_a !== null && (
          <p className="mt-3 font-mono text-2xl text-white">
            {partido.goles_a} <span className="text-slate-500">-</span> {partido.goles_b}
          </p>
        )}
        <p className="mt-2 text-sm text-slate-400">
          Promedio de la fecha:{' '}
          <span className="font-semibold text-emerald-400">
            {formatearPromedio(partido.promedio_fecha)}
          </span>
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

      {/* --- Equipos --- */}
      <section className="grid gap-4 md:grid-cols-2">
        <Equipo
          letra="A"
          items={equipoA}
          estado={partido.estado}
          onQuitar={j => accion(() => quitarJugadorPartido(sesion.token, partidoId, j))}
          ocupado={ocupado}
        />
        <Equipo
          letra="B"
          items={equipoB}
          estado={partido.estado}
          onQuitar={j => accion(() => quitarJugadorPartido(sesion.token, partidoId, j))}
          ocupado={ocupado}
        />
      </section>

      {/* --- Armado del plantel (solo programado) --- */}
      {partido.estado === 'programado' && (
        <section className="rounded-xl border border-white/10 bg-white/5 p-6">
          <h2 className="text-lg font-semibold text-white">
            Jugadores disponibles{' '}
            <span className="text-sm font-normal text-slate-500">
              ({equipoA.length + equipoB.length} de 10 seleccionados)
            </span>
          </h2>

          {disponibles.length === 0 ? (
            <p className="mt-3 text-sm text-slate-400">
              No quedan jugadores para agregar.{' '}
              <Link to="/jugadores" className="text-emerald-400 hover:underline">
                Cargá más jugadores
              </Link>
              .
            </p>
          ) : (
            <ul className="mt-4 space-y-2">
              {disponibles.map(j => (
                <li
                  key={j.id}
                  className="flex items-center gap-3 rounded-lg border border-white/10 bg-black/20 px-4 py-2.5"
                >
                  <span className="text-white">
                    {j.nombre} {j.apellido}
                  </span>
                  {j.apodo && <span className="text-sm text-slate-500">«{j.apodo}»</span>}
                  <div className="ml-auto flex gap-2">
                    <button
                      disabled={ocupado || equipoA.length >= 5}
                      onClick={() =>
                        accion(() => agregarJugadorPartido(sesion.token, partidoId, j.id, 'A'))
                      }
                      className="rounded-lg border border-sky-500/40 px-3 py-1.5 text-xs text-sky-300 transition hover:border-sky-400 disabled:opacity-40"
                    >
                      → Equipo A
                    </button>
                    <button
                      disabled={ocupado || equipoB.length >= 5}
                      onClick={() =>
                        accion(() => agregarJugadorPartido(sesion.token, partidoId, j.id, 'B'))
                      }
                      className="rounded-lg border border-fuchsia-500/40 px-3 py-1.5 text-xs text-fuchsia-300 transition hover:border-fuchsia-400 disabled:opacity-40"
                    >
                      → Equipo B
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-white/10 pt-5">
            <button
              disabled={ocupado || !completo}
              onClick={() => accion(() => comenzarPartido(sesion.token, partidoId))}
              className="rounded-lg bg-emerald-500 px-5 py-2.5 font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Comenzar partido
            </button>
            {!completo && (
              <span className="text-sm text-slate-400">
                Faltan jugadores: equipo A {equipoA.length}/5, equipo B {equipoB.length}/5.
              </span>
            )}
          </div>
        </section>
      )}

      {/* --- Resultado (solo en curso) --- */}
      {partido.estado === 'en_curso' && (
        <section className="rounded-xl border border-white/10 bg-white/5 p-6">
          <h2 className="text-lg font-semibold text-white">Resultado</h2>
          <p className="mt-1 text-sm text-slate-400">
            Cargá los goles y después finalizá el partido para habilitar los puntajes.
          </p>

          <div className="mt-4 flex flex-wrap items-end gap-4">
            <label className="block">
              <span className="mb-2 block text-sm text-slate-300">Goles equipo A</span>
              <input
                type="number"
                min={0}
                value={golesA}
                onChange={e => setGolesA(e.target.value)}
                className="w-28 rounded-lg border border-white/10 bg-black/30 px-4 py-2.5 text-white outline-none focus:border-emerald-400/60"
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-sm text-slate-300">Goles equipo B</span>
              <input
                type="number"
                min={0}
                value={golesB}
                onChange={e => setGolesB(e.target.value)}
                className="w-28 rounded-lg border border-white/10 bg-black/30 px-4 py-2.5 text-white outline-none focus:border-emerald-400/60"
              />
            </label>
            <button
              disabled={ocupado || golesA === '' || golesB === ''}
              onClick={() =>
                accion(() =>
                  cargarResultado(sesion.token, partidoId, Number(golesA), Number(golesB)),
                )
              }
              className="rounded-lg border border-white/20 px-5 py-2.5 text-white transition hover:border-white/40 disabled:opacity-50"
            >
              Guardar resultado
            </button>
            <button
              disabled={ocupado || partido.goles_a === null}
              onClick={() => accion(() => finalizarPartido(sesion.token, partidoId))}
              className="rounded-lg bg-emerald-500 px-5 py-2.5 font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Finalizar partido
            </button>
          </div>
          {partido.goles_a === null && (
            <p className="mt-3 text-sm text-slate-500">
              Guardá el resultado antes de poder finalizar.
            </p>
          )}
        </section>
      )}

      {/* --- Puntajes (solo finalizado y si participé) --- */}
      {partido.estado === 'finalizado' && (
        <section className="rounded-xl border border-white/10 bg-white/5 p-6">
          <h2 className="text-lg font-semibold text-white">Puntajes</h2>

          {!partido.soy_participante ? (
            <p className="mt-2 text-sm text-slate-400">
              Solo los jugadores que participaron del partido pueden cargar puntajes.
            </p>
          ) : (
            <>
              <p className="mt-1 text-sm text-slate-400">
                Puntuá a los {plantel.length} jugadores del partido, vos incluido. Escala de 1 a 10,
                de a medio punto. Podés volver a entrar y corregirlos.
              </p>

              <div className="mt-5 space-y-2">
                {plantel.map(p => (
                  <div
                    key={p.jugador_id}
                    className="flex items-center gap-3 rounded-lg border border-white/10 bg-black/20 px-4 py-2.5"
                  >
                    <span
                      className={`rounded px-1.5 py-0.5 text-xs ${
                        p.equipo === 'A'
                          ? 'bg-sky-500/15 text-sky-300'
                          : 'bg-fuchsia-500/15 text-fuchsia-300'
                      }`}
                    >
                      {p.equipo}
                    </span>
                    <span className="text-white">
                      {p.nombre} {p.apellido}
                    </span>
                    {p.jugador_id === sesion.jugadorId && (
                      <span className="rounded border border-emerald-500/40 px-1.5 py-0.5 text-xs text-emerald-300">
                        vos
                      </span>
                    )}
                    <select
                      value={puntajes[p.jugador_id] ?? ''}
                      onChange={e =>
                        setPuntajes({ ...puntajes, [p.jugador_id]: Number(e.target.value) })
                      }
                      className="ml-auto rounded-lg border border-white/10 bg-black/40 px-3 py-1.5 text-white outline-none focus:border-emerald-400/60"
                    >
                      <option value="">—</option>
                      {ESCALA.map(v => (
                        <option key={v} value={v}>
                          {v.toFixed(1)}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>

              {avisoPuntajes && (
                <p className="mt-4 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
                  {avisoPuntajes}
                </p>
              )}

              <button
                disabled={ocupado || Object.keys(puntajes).length !== plantel.length}
                onClick={() =>
                  accion(async () => {
                    await guardarPuntajes(
                      sesion.token,
                      partidoId,
                      plantel.map(p => ({
                        jugador_id: p.jugador_id,
                        puntaje: puntajes[p.jugador_id],
                      })),
                    )
                    setAvisoPuntajes('Puntajes guardados.')
                  })
                }
                className="mt-5 rounded-lg bg-emerald-500 px-5 py-2.5 font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {partido.ya_puntue ? 'Actualizar puntajes' : 'Guardar puntajes'}
              </button>
              {Object.keys(puntajes).length !== plantel.length && (
                <p className="mt-3 text-sm text-slate-500">
                  Faltan {plantel.length - Object.keys(puntajes).length} jugadores por puntuar.
                </p>
              )}
            </>
          )}
        </section>
      )}
    </div>
  )
}

function Equipo({
  letra,
  items,
  estado,
  onQuitar,
  ocupado,
}: {
  letra: 'A' | 'B'
  items: PlantelItem[]
  estado: string
  onQuitar: (jugadorId: number) => void
  ocupado: boolean
}) {
  const acento = letra === 'A' ? 'text-sky-300' : 'text-fuchsia-300'
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-5">
      <h2 className={`mb-4 font-semibold ${acento}`}>
        Equipo {letra} <span className="text-sm text-slate-500">({items.length}/5)</span>
      </h2>
      {items.length === 0 ? (
        <p className="text-sm text-slate-500">Sin jugadores.</p>
      ) : (
        <ul className="space-y-2">
          {items.map(p => (
            <li
              key={p.jugador_id}
              className="flex items-center gap-3 rounded-lg bg-black/20 px-3 py-2 text-sm"
            >
              <span className="text-white">{nombreCorto(p)}</span>
              <span className="text-slate-500">{p.apellido}</span>
              {estado === 'finalizado' && (
                <span className="ml-auto text-slate-400">
                  {formatearPromedio(p.promedio)}
                  <span className="ml-1 text-xs text-slate-600">({p.votos})</span>
                </span>
              )}
              {estado === 'programado' && (
                <button
                  disabled={ocupado}
                  onClick={() => onQuitar(p.jugador_id)}
                  className="ml-auto rounded border border-white/15 px-2 py-0.5 text-xs text-slate-400 transition hover:border-red-500/50 hover:text-red-300 disabled:opacity-40"
                >
                  Quitar
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
