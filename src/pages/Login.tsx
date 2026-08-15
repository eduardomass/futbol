import { useState, type FormEvent } from 'react'
import Aurora from '@/components/Aurora'
import BlurText from '@/components/BlurText'
import SpotlightCard from '@/components/SpotlightCard'
import { supabase, supabaseConfigurado } from '@/lib/supabase'
import type { Usuario } from '@/types'

type LoginProps = {
  onLogin: (usuario: Usuario) => void
}

export default function Login({ onLogin }: LoginProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [cargando, setCargando] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    if (!supabase) {
      setError('Falta configurar .env.local con VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY.')
      return
    }
    if (!email.trim() || !password) {
      setError('Completá email y contraseña.')
      return
    }

    setCargando(true)
    const { data, error: rpcError } = await supabase.rpc('validar_login', {
      p_email: email,
      p_password: password,
    })
    setCargando(false)

    if (rpcError) {
      setError(`No se pudo conectar con la base: ${rpcError.message}`)
      return
    }

    const usuario = (data as Usuario[] | null)?.[0]
    if (!usuario) {
      setError('Email o contraseña incorrectos.')
      return
    }

    onLogin(usuario)
  }

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-[#05070d]">
      {/* Fondo animado (ReactBits · Aurora) */}
      <div className="pointer-events-none absolute inset-0 opacity-70">
        <Aurora colorStops={['#0ea5e9', '#22c55e', '#0ea5e9']} amplitude={1.1} blend={0.6} speed={0.6} />
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

          {/* Card con spotlight (ReactBits · SpotlightCard) */}
          <SpotlightCard
            className="border-white/10 bg-white/5 p-8 backdrop-blur-xl"
            spotlightColor="rgba(34, 197, 94, 0.18)"
          >
            {!supabaseConfigurado && (
              <div className="mb-5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
                Falta completar <code className="font-mono">.env.local</code> con las credenciales de
                Supabase y reiniciar <code className="font-mono">npm run dev</code>.
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
                <label htmlFor="password" className="mb-2 block text-sm font-medium text-slate-300">
                  Contraseña
                </label>
                <input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-lg border border-white/10 bg-black/30 px-4 py-3 text-white placeholder:text-slate-500 outline-none transition focus:border-emerald-400/60 focus:ring-2 focus:ring-emerald-400/20"
                />
              </div>

              {error && (
                <p role="alert" className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
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
