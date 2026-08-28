import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  agregarJugadorPartido,
  cargarResultado,
  comenzarPartido,
  eliminarPartido,
  finalizarPartido,
  guardarGoles,
  guardarPuntajes,
  listarJugadores,
  misPuntajes,
  obtenerPartido,
  plantelPartido,
  quitarJugadorPartido,
} from '@/lib/api'
import GrillaPuntajes from '@/components/GrillaPuntajes'
import { COLOR_ESTADO, ETIQUETA_ESTADO, formatearFecha, formatearPromedio } from '@/lib/formato'
import { nombreCorto, type Jugador, type PartidoDetalle, type PlantelItem, type Sesion } from '@/types'

type PartidoProps = {
  sesion: Sesion
}

/** Escala de 1 a 10 con medios: 1, 1.5, 2, … 10. */
const ESCALA = Array.from({ length: 19 }, (_, i) => 1 + i * 0.5)

export default function Partido({ sesion }: PartidoProps) {
  const { id } = useParams()
  const navigate = useNavigate()
  const partidoId = Number(id)

  const [partido, setPartido] = useState<PartidoDetalle | null>(null)
  const [plantel, setPlantel] = useState<PlantelItem[]>([])
  const [disponibles, setDisponibles] = useState<Jugador[]>([])
  const [error, setError] = useState<string | null>(null)
  const [cargando, setCargando] = useState(true)
  const [ocupado, setOcupado] = useState(false)

  const [golesA, setGolesA] = useState('')
  const [golesB, setGolesB] = useState('')
  /** Goles de cada jugador, por jugador_id. Se editan como texto para poder vaciar el input. */
  const [golesJugador, setGolesJugador] = useState<Record<number, string>>({})
  const [avisoGoles, setAvisoGoles] = useState<string | null>(null)
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
      setGolesJugador(Object.fromEntries(pl.map(x => [x.jugador_id, String(x.goles ?? 0)])))

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

  /** Borra la fecha entera. Solo admin, y con confirmación: no se deshace. */
  async function borrarPartido() {
    if (!partido) return
    const detalle =
      plantel.length > 0
        ? `Se borran el plantel de ${plantel.length} jugadores y todos los puntajes cargados de esa fecha.`
        : 'No tiene jugadores cargados.'
    if (
      !window.confirm(
        `¿Eliminar la fecha del ${formatearFecha(partido.fecha)}?

${detalle}
No se puede deshacer.`,
      )
    ) {
      return
    }

    setOcupado(true)
    setError(null)
    try {
      await eliminarPartido(sesion.token, partidoId)
      navigate('/', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo eliminar la fecha.')
      setOcupado(false)
    }
  }

  const equipoA = useMemo(() => plantel.filter(p => p.equipo === 'A'), [plantel])
  const equipoB = useMemo(() => plantel.filter(p => p.equipo === 'B'), [plantel])
  const completo = equipoA.length === 5 && equipoB.length === 5

  /**
   * El jugador del partido es el que más planillas pusieron como su mejor
   * puntaje, y el peor el que más pusieron como el más bajo. Si empatan,
   * quedan marcados todos los empatados: con diez votantes pasa seguido.
   */
  const destacados = useMemo(() => {
    const maximo = (campo: 'mejores' | 'peores') =>
      plantel.reduce((m, p) => Math.max(m, p[campo] ?? 0), 0)

    const elegidos = (campo: 'mejores' | 'peores') => {
      const tope = maximo(campo)
      return tope === 0 ? [] : plantel.filter(p => (p[campo] ?? 0) === tope)
    }

    return { mejores: elegidos('mejores'), peores: elegidos('peores') }
  }, [plantel])

  /** Lo que suman los goles individuales que hay ahora en el formulario. */
  function sumaGoles(items: PlantelItem[]): number {
    return items.reduce((total, p) => total + (Number(golesJugador[p.jugador_id]) || 0), 0)
  }

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

      {/* --- Jugador y peor del partido, según las planillas --- */}
      {partido.estado === 'finalizado' &&
        (destacados.mejores.length > 0 || destacados.peores.length > 0) && (
          <section className="grid gap-4 md:grid-cols-2">
            <Destacado
              titulo="Jugador del partido"
              icono="🏆"
              items={destacados.mejores}
              campo="mejores"
              tono="emerald"
            />
            <Destacado
              titulo="Peor del partido"
              icono="👎"
              items={destacados.peores}
              campo="peores"
              tono="red"
            />
          </section>
        )}

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
            Cargá los goles y después finalizá el partido para habilitar los puntajes. Si cargás
            los goles de cada jugador más abajo, este resultado se completa solo con la suma.
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

      {/* --- Goles por jugador (desde que el partido comenzó) --- */}
      {partido.estado !== 'programado' && (
        <section className="rounded-xl border border-white/10 bg-white/5 p-6">
          <h2 className="text-lg font-semibold text-white">Goles por jugador</h2>
          <p className="mt-1 text-sm text-slate-400">
            Cuántos goles hizo cada uno. Al guardar, el resultado de la fecha queda con la suma de
            cada equipo. Si están todos en cero no se toca nada: el resultado se mantiene como
            estaba.
          </p>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <ColumnaGoles
              letra="A"
              items={equipoA}
              valores={golesJugador}
              suma={sumaGoles(equipoA)}
              onCambio={(jugadorId, valor) => {
                setGolesJugador({ ...golesJugador, [jugadorId]: valor })
                setAvisoGoles(null)
              }}
              ocupado={ocupado}
            />
            <ColumnaGoles
              letra="B"
              items={equipoB}
              valores={golesJugador}
              suma={sumaGoles(equipoB)}
              onCambio={(jugadorId, valor) => {
                setGolesJugador({ ...golesJugador, [jugadorId]: valor })
                setAvisoGoles(null)
              }}
              ocupado={ocupado}
            />
          </div>

          <p className="mt-4 text-sm text-slate-400">
            {sumaGoles(plantel) === 0 ? (
              'Sin goles cargados: al guardar, el resultado de la fecha queda como está.'
            ) : (
              <>
                Al guardar, el resultado de la fecha queda{' '}
                <span className="font-mono text-white">
                  {sumaGoles(equipoA)} - {sumaGoles(equipoB)}
                </span>
                .
              </>
            )}
          </p>

          {avisoGoles && (
            <p className="mt-4 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
              {avisoGoles}
            </p>
          )}

          <button
            disabled={ocupado || plantel.length === 0}
            onClick={() =>
              accion(async () => {
                await guardarGoles(
                  sesion.token,
                  partidoId,
                  plantel.map(p => ({
                    jugador_id: p.jugador_id,
                    goles: Number(golesJugador[p.jugador_id]) || 0,
                  })),
                )
                setAvisoGoles('Goles guardados.')
              })
            }
            className="mt-5 rounded-lg bg-emerald-500 px-5 py-2.5 font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Guardar goles
          </button>
        </section>
      )}

      {/* --- Puntajes (solo finalizado y si participé) --- */}
      {partido.estado === 'finalizado' && (
        <section className="rounded-xl border border-white/10 bg-white/5 p-6">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-lg font-semibold text-white">Puntajes</h2>
            {partido.puntajes_cerrados && (
              <span className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-xs text-amber-300">
                cerrados
              </span>
            )}
          </div>

          {!partido.soy_participante ? (
            <p className="mt-2 text-sm text-slate-400">
              Solo los jugadores que participaron del partido pueden cargar puntajes.
            </p>
          ) : (
            <>
              {partido.puntajes_cerrados ? (
                <p className="mt-1 text-sm text-slate-400">
                  Los puntajes de esta fecha ya están cerrados porque hay fechas posteriores
                  cargadas. Quedan a la vista, pero no se pueden cambiar.{' '}
                  {sesion.esAdmin
                    ? 'Para corregir algo, usá la grilla de administrador de más abajo.'
                    : 'Si hay algo para corregir, pedíselo a un administrador.'}
                </p>
              ) : (
                <p className="mt-1 text-sm text-slate-400">
                  Puntuá a los {plantel.length} jugadores del partido, vos incluido. Escala de 1 a
                  10, de a medio punto. Podés volver a entrar y corregirlos hasta que se cargue la
                  fecha siguiente.
                </p>
              )}

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
                      disabled={partido.puntajes_cerrados}
                      onChange={e =>
                        setPuntajes({ ...puntajes, [p.jugador_id]: Number(e.target.value) })
                      }
                      className="ml-auto rounded-lg border border-white/10 bg-black/40 px-3 py-1.5 text-white outline-none focus:border-emerald-400/60 disabled:cursor-not-allowed disabled:opacity-60"
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

              {!partido.puntajes_cerrados && (
                <>
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
            </>
          )}
        </section>
      )}

      {/* --- Grilla completa (solo administradores) --- */}
      {partido.estado === 'finalizado' && sesion.esAdmin && (
        <section className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-6">
          <div className="mb-4 flex items-center gap-3">
            <h2 className="text-lg font-semibold text-white">Grilla de puntajes</h2>
            <span className="rounded border border-emerald-500/40 px-2 py-0.5 text-xs text-emerald-300">
              administrador
            </span>
          </div>
          <GrillaPuntajes
            sesion={sesion}
            partidoId={partidoId}
            plantel={plantel}
            onGuardado={() => void cargar()}
          />
        </section>
      )}

      {/* --- Eliminar la fecha (solo administradores) --- */}
      {sesion.esAdmin && (
        <section className="rounded-xl border border-red-500/20 bg-red-500/5 p-6">
          <div className="mb-2 flex flex-wrap items-center gap-3">
            <h2 className="text-lg font-semibold text-white">Eliminar la fecha</h2>
            <span className="rounded border border-emerald-500/40 px-2 py-0.5 text-xs text-emerald-300">
              administrador
            </span>
          </div>
          <p className="text-sm text-slate-400">
            Borra el partido con su plantel y todos los puntajes cargados. Sirve para una fecha
            creada de más: mientras exista una fecha posterior, los puntajes de la anterior quedan
            cerrados.
          </p>
          <button
            disabled={ocupado}
            onClick={borrarPartido}
            className="mt-4 rounded-lg border border-red-500/40 px-5 py-2.5 text-sm text-red-300 transition hover:border-red-500/70 hover:text-red-200 disabled:opacity-40"
          >
            Eliminar esta fecha
          </button>
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
              {estado !== 'programado' && p.goles > 0 && (
                <span
                  title={`${p.goles} ${p.goles === 1 ? 'gol' : 'goles'}`}
                  className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-xs text-emerald-300"
                >
                  ⚽ {p.goles}
                </span>
              )}
              {estado === 'finalizado' && (
                <span className="ml-auto flex items-center gap-2 text-slate-400">
                  {p.mejores > 0 && (
                    <span
                      title={`${p.mejores} ${p.mejores === 1 ? 'planilla lo puso' : 'planillas lo pusieron'} como su mejor puntaje`}
                      className="text-xs text-emerald-300"
                    >
                      ⭐ {p.mejores}
                    </span>
                  )}
                  {p.peores > 0 && (
                    <span
                      title={`${p.peores} ${p.peores === 1 ? 'planilla lo puso' : 'planillas lo pusieron'} como su peor puntaje`}
                      className="text-xs text-red-300"
                    >
                      👎 {p.peores}
                    </span>
                  )}
                  <span>
                    {formatearPromedio(p.promedio)}
                    <span className="ml-1 text-xs text-slate-600">({p.votos})</span>
                  </span>
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

/**
 * La columna de goles de un equipo, con el subtotal en el encabezado: es el
 * número con el que va a quedar el resultado de la fecha al guardar.
 */
function ColumnaGoles({
  letra,
  items,
  valores,
  suma,
  onCambio,
  ocupado,
}: {
  letra: 'A' | 'B'
  items: PlantelItem[]
  valores: Record<number, string>
  suma: number
  onCambio: (jugadorId: number, valor: string) => void
  ocupado: boolean
}) {
  const acento = letra === 'A' ? 'text-sky-300' : 'text-fuchsia-300'
  return (
    <div className="rounded-xl border border-white/10 bg-black/20 p-5">
      <div className="mb-4 flex items-baseline gap-2">
        <h3 className={`font-semibold ${acento}`}>Equipo {letra}</h3>
        <span className="ml-auto text-sm text-slate-400">
          suma <span className="font-mono text-white">{suma}</span>
        </span>
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-slate-500">Sin jugadores.</p>
      ) : (
        <ul className="space-y-2">
          {items.map(p => (
            <li key={p.jugador_id} className="flex items-center gap-3 text-sm">
              <span className="text-white">{nombreCorto(p)}</span>
              <span className="text-slate-500">{p.apellido}</span>
              <input
                type="number"
                min={0}
                inputMode="numeric"
                disabled={ocupado}
                value={valores[p.jugador_id] ?? '0'}
                onChange={e => onCambio(p.jugador_id, e.target.value)}
                aria-label={`Goles de ${nombreCorto(p)} ${p.apellido}`}
                className="ml-auto w-20 rounded-lg border border-white/10 bg-black/40 px-3 py-1.5 text-right text-white outline-none focus:border-emerald-400/60 disabled:opacity-50"
              />
            </li>
          ))}
        </ul>
      )}

    </div>
  )
}

/** «Ana», «Ana y Bruno», «Ana, Bruno y Carlos». */
function enumerar(nombres: string[]): string {
  if (nombres.length <= 1) return nombres[0] ?? ''
  return `${nombres.slice(0, -1).join(', ')} y ${nombres[nombres.length - 1]}`
}

/**
 * El jugador del partido o el peor: quién juntó más planillas con su puntaje
 * más alto (o más bajo). Si hay empate se muestran todos, porque con diez
 * votantes empatar en dos o tres es lo normal.
 */
function Destacado({
  titulo,
  icono,
  items,
  campo,
  tono,
}: {
  titulo: string
  icono: string
  items: PlantelItem[]
  campo: 'mejores' | 'peores'
  tono: 'emerald' | 'red'
}) {
  if (items.length === 0) return null

  const veces = items[0][campo] ?? 0
  const marco =
    tono === 'emerald' ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-red-500/30 bg-red-500/5'
  const acento = tono === 'emerald' ? 'text-emerald-300' : 'text-red-300'

  return (
    <div className={`rounded-xl border p-5 ${marco}`}>
      <p className={`text-xs uppercase tracking-wide ${acento}`}>
        {icono} {titulo}
      </p>
      <p className="mt-2 text-lg font-semibold text-white">
        {enumerar(items.map(p => `${nombreCorto(p)} ${p.apellido}`))}
      </p>
      <p className="mt-1 text-sm text-slate-400">
        {veces === 1 ? '1 planilla lo eligió' : `${veces} planillas lo eligieron`} como su{' '}
        {campo === 'mejores' ? 'mejor' : 'peor'} puntaje de la fecha
        {items.length > 1 && ', empatados'}.
      </p>
    </div>
  )
}
