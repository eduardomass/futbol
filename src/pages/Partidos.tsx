import { useCallback, useEffect, useState } from 'react'
import ExportarPartidos from '@/components/ExportarPartidos'
import ListaFechas from '@/components/ListaFechas'
import { listarPartidos } from '@/lib/api'
import type { PartidoResumen, Sesion } from '@/types'

type PartidosProps = {
  sesion: Sesion
}

/**
 * Todas las fechas cargadas, para entrar a cualquiera. Es el mismo listado que
 * el inicio muestra al final, con su propia entrada en el menú.
 */
export default function Partidos({ sesion }: PartidosProps) {
  const [partidos, setPartidos] = useState<PartidoResumen[]>([])
  const [error, setError] = useState<string | null>(null)
  const [cargando, setCargando] = useState(true)

  const cargar = useCallback(async () => {
    setCargando(true)
    setError(null)
    try {
      setPartidos(await listarPartidos(sesion.token))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron cargar los partidos.')
    } finally {
      setCargando(false)
    }
  }, [sesion.token])

  useEffect(() => {
    void cargar()
  }, [cargar])

  if (cargando) return <p className="text-slate-400">Cargando…</p>

  const finalizados = partidos.filter(p => p.estado === 'finalizado').length
  const pendientes = partidos.length - finalizados

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white">Partidos</h1>
        <p className="mt-2 text-sm text-slate-400">
          {partidos.length === 0
            ? 'Todavía no hay fechas cargadas.'
            : `${partidos.length} fechas cargadas: ${finalizados} finalizadas y ${pendientes} sin terminar. De la más nueva a la más vieja; tocá una para entrar.`}
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

      <ExportarPartidos token={sesion.token} partidos={partidos} />

      <ListaFechas
        partidos={partidos}
        vacio="No hay fechas cargadas. Creá la primera desde el inicio, con «Empezar fecha»."
      />
    </div>
  )
}
