'use client'

import { useState, useEffect, useActionState } from 'react'
import { login } from '@/actions/auth'
import { Lock, User, KeyRound, Loader2, ShieldCheck, ShieldAlert } from 'lucide-react'

export default function LoginPage() {
  const [deviceHash, setDeviceHash] = useState<string>('')
  const [deviceUuid, setDeviceUuid] = useState<string>('')
  const [isClientReady, setIsClientReady] = useState(false)
  const [state, formAction, isPending] = useActionState(login, { error: '' })

  useEffect(() => {
    const initializeDevice = async () => {
      try {
        // 1. Obtener o generar UUID de forma segura (randomUUID falla en HTTP local)
        let uuid = localStorage.getItem('device_uuid')
        if (!uuid) {
          uuid = (window.crypto && window.crypto.randomUUID) 
            ? window.crypto.randomUUID() 
            : 'dev-uuid-' + Math.random().toString(36).substring(2, 15)
          localStorage.setItem('device_uuid', uuid)
        }
        setDeviceUuid(uuid)

        // 2. Obtener huella de hardware con Timeout (fp.get() puede colgarse infinito en HTTP)
        const fetchFp = async () => {
          const fpModule = await import('@fingerprintjs/fingerprintjs')
          const fp = await fpModule.load()
          const result = await fp.get()
          return result.visitorId
        }
        
        // Timeout de 2 segundos para evitar que se quede "Verificando dispositivo..." eternamente
        const hash = await Promise.race([
          fetchFp(),
          new Promise<string>((resolve) => setTimeout(() => resolve('fallback-hash-' + uuid), 2000))
        ])

        setDeviceHash(hash)
      } catch (error) {
        console.error("Error inicializando huella del dispositivo:", error)
        setDeviceHash('fallback-hash-error')
      } finally {
        setIsClientReady(true)
      }
    }

    initializeDevice()
  }, [])

  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4 relative overflow-hidden">
      {/* Textura de puntos sutil — CSS puro, sin imágenes */}
      <div 
        className="absolute inset-0 opacity-[0.45] pointer-events-none"
        style={{
          backgroundImage: 'radial-gradient(circle, #64748b 1.5px, transparent 1.5px)',
          backgroundSize: '24px 24px'
        }}
      />
      {/* Viñeta para suavizar los bordes de la textura */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_transparent_40%,_#0f172a_100%)] pointer-events-none" />
      
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden border border-white/10 ring-1 ring-black/5 relative z-10">
        
        {/* Cabecera */}
        <div className="bg-gradient-to-br from-slate-900 to-slate-800 p-8 text-center text-white relative overflow-hidden">
          {/* Fondo decorativo sutil */}
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-blue-900/30 via-transparent to-transparent pointer-events-none" />
          <div className="absolute top-4 right-4 z-10">
            {isClientReady ? (
              <ShieldCheck className="text-emerald-400 w-6 h-6 drop-shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
            ) : (
              <ShieldAlert className="text-amber-400 w-6 h-6 animate-pulse" />
            )}
          </div>
          <div className="relative z-10 mx-auto bg-gradient-to-br from-slate-700 to-slate-900 w-16 h-16 rounded-full flex items-center justify-center mb-4 border border-slate-600 ring-4 ring-blue-500/20 shadow-lg shadow-blue-500/20">
            <Lock className="w-8 h-8 text-blue-400" />
          </div>
          <h1 className="text-2xl font-bold relative z-10">Control de Asistencias</h1>
          <p className="text-slate-400 text-sm mt-2 relative z-10">Acceso seguro anti-fraude</p>
        </div>

        {/* Formulario */}
        <div className="p-8 bg-white">
          <form action={formAction} className="space-y-6">
            
            {/* Campos Ocultos para Huella Híbrida */}
            <input type="hidden" name="deviceHash" value={deviceHash} />
            <input type="hidden" name="deviceUuid" value={deviceUuid} />

            {/* Error Message */}
            {state?.error && (
              <div className="bg-red-50 text-red-600 text-sm p-3 rounded-lg border border-red-200 flex items-start animate-[shake_0.3s_ease-in-out]">
                <span className="font-semibold block">{state.error}</span>
              </div>
            )}

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Usuario</label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none z-10">
                  <User className="h-5 w-5 text-slate-400 group-focus-within:text-blue-500 transition-colors duration-200" />
                </div>
                <input
                  type="text"
                  name="usuario"
                  required
                  placeholder="usuario"
                  className="block w-full pl-11 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 hover:border-slate-300 hover:bg-white transition-all duration-200 font-medium placeholder:font-normal placeholder:text-slate-400"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Contraseña</label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none z-10">
                  <KeyRound className="h-5 w-5 text-slate-400 group-focus-within:text-blue-500 transition-colors duration-200" />
                </div>
                <input
                  type="password"
                  name="password"
                  required
                  placeholder="••••••••"
                  className="block w-full pl-11 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 hover:border-slate-300 hover:bg-white transition-all duration-200 font-medium placeholder:font-normal placeholder:text-slate-400"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isPending}
              className="w-full bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 text-white font-bold py-4 px-4 rounded-2xl shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 transition-all duration-200 active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed flex justify-center items-center mt-6 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
              {isPending ? (
                <>
                  <Loader2 className="animate-spin -ml-1 mr-2 h-5 w-5" />
                  Iniciando sesión...
                </>
              ) : (
                'Iniciar Sesión'
              )}
            </button>
          </form>
        </div>
      </div>
      
      {/* Información de Debug en Desarrollo */}
      {process.env.NODE_ENV !== 'production' && isClientReady && (
        <div className="fixed bottom-4 left-4 text-xs text-gray-400 max-w-xs break-all">
          <p>UUID: {deviceUuid}</p>
          <p>Hash: {deviceHash}</p>
        </div>
      )}
    </main>
  )
}
