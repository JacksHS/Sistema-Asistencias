'use client'

import { useEffect } from 'react'
import { Clock, RotateCw, LogOut } from 'lucide-react'

export default function GlobalSessionError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.warn('Sesión o estado expirado capturado de forma segura:', error)
  }, [error])

  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4 relative overflow-hidden">
      {/* Textura de puntos sutil — idéntica al Login */}
      <div
        className="absolute inset-0 opacity-[0.45] pointer-events-none"
        style={{
          backgroundImage: 'radial-gradient(circle, #64748b 1.5px, transparent 1.5px)',
          backgroundSize: '24px 24px',
        }}
      />
      {/* Viñeta para suavizar los bordes de la textura */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_transparent_40%,_#0f172a_100%)] pointer-events-none" />

      <div className="w-full max-w-md relative z-10 flex flex-col items-center">
        <div className="w-full bg-white rounded-2xl shadow-2xl overflow-hidden border border-white/10 ring-1 ring-black/5">
          {/* Cabecera oscura con el estilo del Login */}
          <div className="bg-gradient-to-br from-slate-900 to-slate-800 p-8 text-center text-white relative overflow-hidden">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-amber-500/20 via-transparent to-transparent pointer-events-none" />
            <div className="relative z-10 mx-auto bg-gradient-to-br from-slate-700 to-slate-900 w-16 h-16 rounded-full flex items-center justify-center mb-4 border border-amber-500/40 ring-4 ring-amber-500/20 shadow-lg shadow-amber-500/20">
              <Clock className="w-8 h-8 text-amber-400" />
            </div>
            <h1 className="text-2xl font-bold relative z-10">Tiempo de Sesión Culminado</h1>
            <p className="text-slate-300 text-sm mt-1.5 relative z-10 font-normal">
              Protección automática de cuenta
            </p>
          </div>

          {/* Cuerpo del mensaje */}
          <div className="p-8 bg-white text-center space-y-6">
            <div className="bg-amber-50 border border-amber-200/80 rounded-xl p-4 text-slate-700 text-sm leading-relaxed">
              El tiempo de sesión se ha culminado por seguridad. Por favor,{' '}
              <span className="font-semibold text-slate-900">vuelve a registrar tu sesión</span> o recarga la página para continuar.
            </div>

            <div className="space-y-3">
              <button
                type="button"
                onClick={() => {
                  window.location.href = '/'
                }}
                className="w-full bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 text-white font-bold py-4 px-4 rounded-2xl shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 transition-all duration-200 active:scale-[0.98] flex justify-center items-center gap-2"
              >
                <LogOut className="w-5 h-5" />
                Volver a Registrar mi Sesión
              </button>

              <button
                type="button"
                onClick={() => {
                  try {
                    reset()
                  } catch {
                    window.location.href = '/'
                  }
                }}
                className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold py-3.5 px-4 rounded-2xl transition-all duration-200 active:scale-[0.98] flex justify-center items-center gap-2 text-sm border border-slate-200"
              >
                <RotateCw className="w-4 h-4 text-slate-500" />
                Recargar Página
              </button>
            </div>
          </div>
        </div>

        {/* Pie de página idéntico al Login */}
        <div className="w-full mt-4 px-2 flex items-center justify-between text-[11px] text-slate-400/60 select-none tracking-wide font-light">
          <span className="font-mono text-slate-400/70">v1.0.5</span>
          <span className="text-slate-400/60">© 2026 JacksHS • Derechos Reservados</span>
        </div>
      </div>
    </main>
  )
}
