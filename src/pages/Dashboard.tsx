import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import BlurText from '@/components/BlurText'
import SplitFlapText from '@/components/SplitFlapText'
import { crearPartido, estadisticas, listarPartidos, misPartidos, proximoJueves } from '@/lib/api'
import {
  COLOR_ESTADO,
  ETIQUETA_ESTADO,
  formatearFecha,
  formatearFechaCorta,
  formatearPromedio,
} from '@/lib/formato'
import type { Estadisticas, MiPartido, PartidoResumen, Sesion } from '@/types'

type DashboardProps = {
  sesion: Sesion
}

/** El apriete para el que jugó la última fecha y todavía no votó. */
const CARTELES = ['VOTA SALAME!', 'HACE CLICK ACA', 'DALE!', 'CAGON!']

export default function Dashboard({ sesion }: DashboardProps) {
  const navigate = useNavigate()
  const [stats, setStats] = useState<Estadisticas | null>(null)
  const [mios, setMios] = useState<MiPartido[]>([])
  const [todos, setTodos] = useState<PartidoResumen[]>([])
  const [fecha, setFecha] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [cargando, setCargando] = useState(true)
  const [creando, setCreando] = useState(false)

  const cargar = useCallback(async () => {
    setCargando(true)
    setError(null)
    try {
      const [s, m, t, jueves] = await Promise.all([
        estadisticas(sesion.token),
        misPartidos(sesion.token),
        listarPartidos(sesion.token),
        proximoJueves(),
      ])
      setStats(s)
      setMios(m)
      setTodos(t)
      setFecha(prev => prev || jueves)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron cargar los datos.')
    } finally {
      setCargando(false)
    }
  }, [sesion.token])

  useEffect(() => {
    void cargar()
  }, [cargar])

  /**
   * La última fecha que jugué, si todavía no cargué mis puntajes y la
   * votación sigue abierta. Si ya hay una fecha posterior no tiene sentido
   * mandarlo: la base rechaza la carga.
   */
  const votacionPendiente = useMemo(() => {
    // `mis_partidos` viene ordenado por fecha desc, así que la primera
    // finalizada es la última que jugué.
    const ultima = mios.find(p => p.estado === 'finalizado')
    if (!ultima || ultima.ya_puntue) return null
    const fechaMasReciente = todos.reduce((max, p) => (p.fecha > max ? p.fecha : max), '')
    return fechaMasReciente > ultima.fecha ? null : ultima
  }, [mios, todos])

  async function empezarFecha() {
    setCreando(true)
    setError(null)
    try {
      const id = await crearPartido(sesion.token, fecha || null)
      navigate(`/partido/${id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear el partido.')
    } finally {
      setCreando(false)
    }
  }

  if (cargando) {
    return <p className="text-slate-400">Cargando…</p>
  }

  return (
    <div className="space-y-10">
      <BlurText
        text={`Hola, ${sesion.nombre}`}
        animateBy="words"
        delay={120}
        className="text-3xl font-bold text-white"
      />

      {/* --- Te falta votar --- */}
      {votacionPendiente && (
        <Link
          to={`/partido/${votacionPendiente.id}`}
          aria-label={`Cargar tus puntajes de la fecha del ${formatearFechaCorta(votacionPendiente.fecha)}`}
          className="block rounded-xl border border-amber-500/40 bg-amber-500/10 p-5 transition hover:border-amber-400/70 hover:bg-amber-500/15"
        >
          <p className="text-xs font-medium uppercase tracking-wide text-amber-300">
            Te falta votar la fecha del {formatearFechaCorta(votacionPendiente.fecha)}
          </p>

          <div className="mt-3 overflow-x-auto">
            <SplitFlapText
              words={CARTELES}
              fontSize="clamp(14px, 4.5vw, 32px)"
              tileColor="#1c1917"
              textColor="#fcd34d"
              cycleDelay={1800}
            />
          </div>

          <p className="mt-3 text-sm text-slate-300">
            Jugaste esa fecha y todavía no puntuaste a nadie. Tocá acá y ponéles nota a los 10,
            vos incluido. Se cierra cuando se cargue la fecha siguiente.
          </p>
        </Link>
      )}

      {error && (
        <p
          role="alert"
          className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200"
        >
          {error}
        </p>
      )}

      {/* --- Empezar fecha --- */}
      <section className="rounded-xl border border-white/10 bg-white/5 p-6">
        <h2 className="text-lg font-semibold text-white">Empezar fecha</h2>
        <p className="mt-1 text-sm text-slate-400">
          Por defecto se propone el próximo jueves. Podés cambiar la fecha antes de crearla.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <input
            type="date"
            value={fecha}
            onChange={e => setFecha(e.target.value)}
            className="rounded-lg border border-white/10 bg-black/30 px-4 py-2.5 text-white outline-none transition focus:border-emerald-400/60"
          />
          <button
            onClick={empezarFecha}
            disabled={creando}
            className="rounded-lg bg-emerald-500 px-5 py-2.5 font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:opacity-60"
          >
            {creando ? 'Creando…' : 'Empezar fecha'}
          </button>
          {fecha && <span className="text-sm text-slate-400">{formatearFecha(fecha)}</span>}
        </div>
      </section>

      {/* --- Estadísticas --- */}
      <section>
        <h2 className="mb-4 text-lg font-semibold text-white">Mis estadísticas</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Tarjeta titulo="Partidos ganados" valor={stats?.partidos_ganados ?? 0} destacado />
          <Tarjeta titulo="Promedio general" valor={formatearPromedio(stats?.promedio_general)} />
          <Tarjeta titulo="Jugados" valor={stats?.partidos_jugados ?? 0} />
          <Tarjeta
            titulo="Empates / derrotas"
            valor={`${stats?.partidos_empatados ?? 0} / ${stats?.partidos_perdidos ?? 0}`}
          />
        </div>
      </section>

      {/* --- Mis partidos --- */}
      <section>
        <h2 className="mb-4 text-lg font-semibold text-white">Partidos en los que participé</h2>
        {mios.length === 0 ? (
          <p className="rounded-xl border border-white/10 bg-white/5 p-6 text-sm text-slate-400">
            Todavía no participaste de ningún partido.
          </p>
        ) : (
          <ul className="space-y-2">
            {mios.map(p => (
              <li key={p.id}>
                <Link
                  to={`/partido/${p.id}`}
                  className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-white/10 bg-white/5 px-5 py-4 transition hover:border-white/25"
                >
                  <span className="font-medium text-white">{formatearFechaCorta(p.fecha)}</span>
                  <span className="rounded-md border border-white/15 px-2 py-0.5 text-xs text-slate-300">
                    Equipo {p.equipo}
                  </span>
                  {p.goles_a !== null && (
                    <span className="font-mono text-slate-300">
                      {p.goles_a} - {p.goles_b}
                    </span>
                  )}
                  {p.resultado && <Resultado valor={p.resultado} />}
                  <span className="ml-auto text-sm text-slate-400">
                    Mi promedio: {formatearPromedio(p.mi_promedio)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* --- Todas las fechas --- */}
      <section>
        <h2 className="mb-4 text-lg font-semibold text-white">Todas las fechas</h2>
        {todos.length === 0 ? (
          <p className="rounded-xl border border-white/10 bg-white/5 p-6 text-sm text-slate-400">
            No hay fechas cargadas. Creá la primera con «Empezar fecha».
          </p>
        ) : (
          <ul className="space-y-2">
            {todos.map(p => (
              <li key={p.id}>
                <Link
                  to={`/partido/${p.id}`}
                  className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-white/10 bg-white/5 px-5 py-4 transition hover:border-white/25"
                >
                  <span className="font-medium text-white">{formatearFechaCorta(p.fecha)}</span>
                  <span
                    className={`rounded-md border px-2 py-0.5 text-xs ${COLOR_ESTADO[p.estado]}`}
                  >
                    {ETIQUETA_ESTADO[p.estado]}
                  </span>
                  {p.goles_a !== null && (
                    <span className="font-mono text-slate-300">
                      {p.goles_a} - {p.goles_b}
                    </span>
                  )}
                  <span className="text-sm text-slate-400">{p.jugadores}/10 jugadores</span>
                  <span className="ml-auto text-sm text-slate-400">
                    Promedio fecha: {formatearPromedio(p.promedio)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function Tarjeta({
  titulo,
  valor,
  destacado = false,
}: {
  titulo: string
  valor: string | number
  destacado?: boolean
}) {
  return (
    <div
      className={`rounded-xl border p-5 ${
        destacado ? 'border-emerald-500/30 bg-emerald-500/10' : 'border-white/10 bg-white/5'
      }`}
    >
      <p className="text-xs uppercase tracking-wide text-slate-400">{titulo}</p>
      <p
        className={`mt-2 text-3xl font-bold ${destacado ? 'text-emerald-300' : 'text-white'}`}
      >
        {valor}
      </p>
    </div>
  )
}

function Resultado({ valor }: { valor: 'ganado' | 'empate' | 'perdido' }) {
  const estilos = {
    ganado: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300',
    empate: 'border-slate-500/40 bg-slate-500/10 text-slate-300',
    perdido: 'border-red-500/40 bg-red-500/10 text-red-300',
  }[valor]
  const texto = { ganado: 'Ganado', empate: 'Empate', perdido: 'Perdido' }[valor]
  return <span className={`rounded-md border px-2 py-0.5 text-xs ${estilos}`}>{texto}</span>
}
