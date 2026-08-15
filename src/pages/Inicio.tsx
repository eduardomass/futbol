import BlurText from '@/components/BlurText'
import type { Usuario } from '@/types'

type InicioProps = {
  usuario: Usuario
  onLogout: () => void
}

export default function Inicio({ usuario, onLogout }: InicioProps) {
  return (
    <div className="min-h-screen bg-[#05070d] px-4 py-12">
      <div className="mx-auto max-w-3xl">
        <header className="mb-10 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="text-3xl" aria-hidden>
              ⚽
            </span>
            <span className="text-xl font-bold text-white">Futbol</span>
          </div>
          <button
            onClick={onLogout}
            className="rounded-lg border border-white/15 px-4 py-2 text-sm text-slate-300 transition hover:border-white/30 hover:text-white"
          >
            Cerrar sesión
          </button>
        </header>

        <BlurText
          text={`Hola, ${usuario.email}`}
          animateBy="words"
          delay={120}
          className="text-3xl font-bold text-white"
        />

        <p className="mt-4 text-slate-400">
          Sesión iniciada correctamente contra la tabla <code className="font-mono text-emerald-400">usuarios</code>{' '}
          (id&nbsp;{usuario.id}).
        </p>

        <div className="mt-10 rounded-xl border border-white/10 bg-white/5 p-6">
          <h2 className="text-lg font-semibold text-white">Próximos pasos</h2>
          <ul className="mt-3 list-inside list-disc space-y-1 text-sm text-slate-400">
            <li>Tablas de equipos, jugadores y partidos</li>
            <li>Carga de resultados y tabla de posiciones</li>
            <li>Roles y permisos por usuario</li>
          </ul>
        </div>
      </div>
    </div>
  )
}
