import { Link } from 'react-router-dom'
import { COLOR_ESTADO, ETIQUETA_ESTADO, formatearFechaCorta, formatearPromedio } from '@/lib/formato'
import type { PartidoResumen } from '@/types'

/**
 * El listado de fechas para entrar a una. Lo comparten el inicio («Todas las
 * fechas») y la pantalla `/partidos`, para que las dos muestren lo mismo.
 */
export default function ListaFechas({
  partidos,
  vacio,
}: {
  partidos: PartidoResumen[]
  vacio: string
}) {
  if (partidos.length === 0) {
    return (
      <p className="rounded-xl border border-white/10 bg-white/5 p-6 text-sm text-slate-400">
        {vacio}
      </p>
    )
  }

  return (
    <ul className="space-y-2">
      {partidos.map(p => (
        <li key={p.id}>
          <Link
            to={`/partido/${p.id}`}
            className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-white/10 bg-white/5 px-5 py-4 transition hover:border-white/25"
          >
            <span className="font-medium text-white">{formatearFechaCorta(p.fecha)}</span>
            <span className={`rounded-md border px-2 py-0.5 text-xs ${COLOR_ESTADO[p.estado]}`}>
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
  )
}
