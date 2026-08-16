import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { actualizarJugador, crearJugador, eliminarJugador, listarJugadores } from '@/lib/api'
import type { Jugador, Sesion } from '@/types'

type JugadoresProps = {
  sesion: Sesion
}

const FORM_VACIO = { nombre: '', apellido: '', apodo: '', email: '', clave: '' }

export default function Jugadores({ sesion }: JugadoresProps) {
  const [jugadores, setJugadores] = useState<Jugador[]>([])
  const [form, setForm] = useState(FORM_VACIO)
  const [editandoId, setEditandoId] = useState<number | null>(null)
  const [incluirInactivos, setIncluirInactivos] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)

  const cargar = useCallback(async () => {
    setCargando(true)
    try {
      setJugadores(await listarJugadores(sesion.token, incluirInactivos))
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron cargar los jugadores.')
    } finally {
      setCargando(false)
    }
  }, [sesion.token, incluirInactivos])

  useEffect(() => {
    void cargar()
  }, [cargar])

  function empezarEdicion(j: Jugador) {
    setEditandoId(j.id)
    setForm({
      nombre: j.nombre,
      apellido: j.apellido,
      apodo: j.apodo ?? '',
      email: j.email,
      clave: '',
    })
    setAviso(null)
    setError(null)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function cancelar() {
    setEditandoId(null)
    setForm(FORM_VACIO)
    setError(null)
  }

  async function guardar(e: FormEvent) {
    e.preventDefault()
    setGuardando(true)
    setError(null)
    setAviso(null)
    try {
      if (editandoId === null) {
        await crearJugador(sesion.token, form)
        setAviso(`Jugador ${form.nombre} ${form.apellido} agregado.`)
      } else {
        await actualizarJugador(sesion.token, editandoId, form)
        setAviso('Cambios guardados.')
      }
      cancelar()
      await cargar()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar.')
    } finally {
      setGuardando(false)
    }
  }

  async function borrar(j: Jugador) {
    if (!window.confirm(`¿Eliminar a ${j.nombre} ${j.apellido}?`)) return
    setError(null)
    setAviso(null)
    try {
      const resultado = await eliminarJugador(sesion.token, j.id)
      setAviso(
        resultado === 'desactivado'
          ? `${j.nombre} jugó partidos, así que se desactivó en vez de borrarse (se conserva el historial).`
          : `${j.nombre} eliminado.`,
      )
      await cargar()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo eliminar.')
    }
  }

  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-bold text-white">Jugadores</h1>

      {/* --- Alta / edición --- */}
      <section className="rounded-xl border border-white/10 bg-white/5 p-6">
        <h2 className="mb-4 text-lg font-semibold text-white">
          {editandoId === null ? 'Nuevo jugador' : 'Editando jugador'}
        </h2>

        <form onSubmit={guardar} className="space-y-4" noValidate>
          <div className="grid gap-4 sm:grid-cols-3">
            <Campo
              label="Nombre"
              value={form.nombre}
              onChange={v => setForm({ ...form, nombre: v })}
            />
            <Campo
              label="Apellido"
              value={form.apellido}
              onChange={v => setForm({ ...form, apellido: v })}
            />
            <Campo
              label="Apodo"
              value={form.apodo}
              onChange={v => setForm({ ...form, apodo: v })}
              opcional
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Campo
              label="Email"
              type="email"
              value={form.email}
              onChange={v => setForm({ ...form, email: v })}
            />
            <Campo
              label={editandoId === null ? 'Clave' : 'Clave (vacío = no cambiar)'}
              type="password"
              value={form.clave}
              onChange={v => setForm({ ...form, clave: v })}
              opcional={editandoId !== null}
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

          <div className="flex gap-3">
            <button
              type="submit"
              disabled={guardando}
              className="rounded-lg bg-emerald-500 px-5 py-2.5 font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:opacity-60"
            >
              {guardando ? 'Guardando…' : editandoId === null ? 'Agregar' : 'Guardar cambios'}
            </button>
            {editandoId !== null && (
              <button
                type="button"
                onClick={cancelar}
                className="rounded-lg border border-white/15 px-5 py-2.5 text-slate-300 transition hover:border-white/30 hover:text-white"
              >
                Cancelar
              </button>
            )}
          </div>
        </form>
      </section>

      {aviso && (
        <p className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
          {aviso}
        </p>
      )}

      {/* --- Listado --- */}
      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">
            Listado {jugadores.length > 0 && <span className="text-slate-500">({jugadores.length})</span>}
          </h2>
          <label className="flex items-center gap-2 text-sm text-slate-400">
            <input
              type="checkbox"
              checked={incluirInactivos}
              onChange={e => setIncluirInactivos(e.target.checked)}
              className="size-4 accent-emerald-500"
            />
            Mostrar inactivos
          </label>
        </div>

        {cargando ? (
          <p className="text-slate-400">Cargando…</p>
        ) : jugadores.length === 0 ? (
          <p className="rounded-xl border border-white/10 bg-white/5 p-6 text-sm text-slate-400">
            Todavía no hay jugadores cargados.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-white/10">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="bg-white/5 text-xs uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="px-4 py-3">Nombre</th>
                  <th className="px-4 py-3">Apodo</th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {jugadores.map(j => (
                  <tr key={j.id} className="border-t border-white/5">
                    <td className="px-4 py-3 text-white">
                      {j.nombre} {j.apellido}
                      {!j.activo && (
                        <span className="ml-2 rounded border border-slate-500/40 px-1.5 py-0.5 text-xs text-slate-400">
                          inactivo
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-400">{j.apodo ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-400">{j.email}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => empezarEdicion(j)}
                          className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-slate-300 transition hover:border-white/30 hover:text-white"
                        >
                          Editar
                        </button>
                        <button
                          onClick={() => borrar(j)}
                          className="rounded-lg border border-red-500/30 px-3 py-1.5 text-xs text-red-300 transition hover:border-red-500/60 hover:text-red-200"
                        >
                          Eliminar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}

function Campo({
  label,
  value,
  onChange,
  type = 'text',
  opcional = false,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
  opcional?: boolean
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-slate-300">
        {label}
        {opcional && <span className="ml-1 text-xs text-slate-500">(opcional)</span>}
      </span>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        autoComplete="off"
        className="w-full rounded-lg border border-white/10 bg-black/30 px-4 py-2.5 text-white placeholder:text-slate-500 outline-none transition focus:border-emerald-400/60 focus:ring-2 focus:ring-emerald-400/20"
      />
    </label>
  )
}
