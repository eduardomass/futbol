import { useState, type FormEvent } from 'react'
import Aurora from '@/components/Aurora'
import BlurText from '@/components/BlurText'
import SpotlightCard from '@/components/SpotlightCard'
import { iniciarSesion } from '@/lib/api'
import { supabaseConfigurado } from '@/lib/supabase'
import { guardarSesion } from '@/lib/session'
import type { Sesion } from '@/types'

type LoginProps = {
  onLogin: (sesion: Sesion) => void
}

export default function Login({ onLogin }: LoginProps) {
  const [email, setEmail] = useState('')
  const [clave, setClave] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [cargando, setCargando] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    if (!email.trim() || !clave) {
      setError('Completá email y contraseña.')
      return
    }

    setCargando(true)
    try {
      const sesion = await iniciarSesion(email, clave)
      if (!sesion) {
        setError('Email o contraseña incorrectos.')
        return
      }
      guardarSesion(sesion)
      onLogin(sesion)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo conectar con la base.')
    } finally {
      setCargando(false)
    }
  }

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-[#05070d]">
      {/* Fondo animado (ReactBits · Aurora) */}
      <div className="pointer-events-none absolute inset-0 opacity-70">
        <Aurora
          colorStops={['#0ea5e9', '#22c55e', '#0ea5e9']}
          amplitude={1.1}
          blend={0.6}
          speed={0.6}
        />
      </div>

      <main className="relative z-10 flex min-h-screen items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          <div className="mb-8 text-center">
            <div className="mb-4 text-5xl" aria-hidden>
              ⚽
            </div>
            <BlurText
              text="Futbol"
              animateBy="letters"
              delay={60}
              className="justify-center text-4xl font-bold tracking-tight text-white"
            />
            <p className="mt-3 text-sm text-slate-400">Ingresá con tu usuario para continuar</p>
          </div>

          <SpotlightCard
            className="border-white/10 bg-white/5 p-8 backdrop-blur-xl"
            spotlightColor="rgba(34, 197, 94, 0.18)"
          >
            {!supabaseConfigurado && (
              <div className="mb-5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
                {import.meta.env.DEV ? (
                  <>
                    Falta completar <code className="font-mono">.env.local</code> con las credenciales
                    de Supabase y reiniciar <code className="font-mono">npm run dev</code>.
                  </>
                ) : (
                  <>
                    Este build se compiló sin credenciales de Supabase. Hay que cargar{' '}
                    <code className="font-mono">VITE_SUPABASE_URL</code> y{' '}
                    <code className="font-mono">VITE_SUPABASE_ANON_KEY</code> como variables de{' '}
                    <strong>build</strong> en Cloudflare y volver a desplegar.
                  </>
                )}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5" noValidate>
              <div>
                <label htmlFor="email" className="mb-2 block text-sm font-medium text-slate-300">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  autoComplete="username"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="tucorreo@ejemplo.com"
                  className="w-full rounded-lg border border-white/10 bg-black/30 px-4 py-3 text-white placeholder:text-slate-500 outline-none transition focus:border-emerald-400/60 focus:ring-2 focus:ring-emerald-400/20"
                />
              </div>

              <div>
                <label htmlFor="clave" className="mb-2 block text-sm font-medium text-slate-300">
                  Contraseña
                </label>
                <input
                  id="clave"
                  type="password"
                  autoComplete="current-password"
                  value={clave}
                  onChange={e => setClave(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-lg border border-white/10 bg-black/30 px-4 py-3 text-white placeholder:text-slate-500 outline-none transition focus:border-emerald-400/60 focus:ring-2 focus:ring-emerald-400/20"
                />
              </div>

              {error && (
                <p
                  role="alert"
                  className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200"
                >
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={cargando}
                className="w-full rounded-lg bg-emerald-500 px-4 py-3 font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {cargando ? 'Validando…' : 'Ingresar'}
              </button>
            </form>
          </SpotlightCard>
        </div>
      </main>
    </div>
  )
}
