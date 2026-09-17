'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { generarTokenKiosco, liberarKiosco } from '@/actions/kiosco'
import { ShieldCheck, ShieldAlert, Loader2, Maximize, Minimize, RefreshCw, MonitorX } from 'lucide-react'
import { toast } from 'sonner'

export default function KioscoPage() {
  const [token, setToken] = useState<string | null>(null)
  const [progress, setProgress] = useState(100)
  const [time, setTime] = useState<Date | null>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [isBlocked, setIsBlocked] = useState(false)
  const [blockedMessage, setBlockedMessage] = useState('')
  const [isRetrying, setIsRetrying] = useState(false)
  const [deviceId, setDeviceId] = useState<string>('')
  const deviceIdRef = useRef<string>('')

  const toggleFullscreen = () => {
    try {
      const doc: any = document
      const docEl: any = document.documentElement
      const isFull = Boolean(doc.fullscreenElement || doc.webkitFullscreenElement || doc.mozFullScreenElement || doc.msFullscreenElement)

      if (!isFull) {
        if (docEl.requestFullscreen) {
          docEl.requestFullscreen().catch(() => {})
        } else if (docEl.webkitRequestFullscreen) {
          docEl.webkitRequestFullscreen()
        } else if (docEl.msRequestFullscreen) {
          docEl.msRequestFullscreen()
        }
      } else {
        if (doc.exitFullscreen) {
          doc.exitFullscreen().catch(() => {})
        } else if (doc.webkitExitFullscreen) {
          doc.webkitExitFullscreen()
        } else if (doc.msExitFullscreen) {
          doc.msExitFullscreen()
        }
      }
    } catch (e) {
      // Ignorar si no está soportado
    }
  }

  useEffect(() => {
    const onFullscreenChange = () => {
      const doc: any = document
      setIsFullscreen(Boolean(doc.fullscreenElement || doc.webkitFullscreenElement || doc.mozFullScreenElement || doc.msFullscreenElement))
    }
    document.addEventListener('fullscreenchange', onFullscreenChange)
    document.addEventListener('webkitfullscreenchange', onFullscreenChange)
    return () => {
      document.removeEventListener('fullscreenchange', onFullscreenChange)
      document.removeEventListener('webkitfullscreenchange', onFullscreenChange)
    }
  }, [])

  // Inicializar o recuperar UUID persistente del Kiosco en este navegador
  useEffect(() => {
    let id = localStorage.getItem('kiosk_device_id')
    if (!id) {
      id = (window.crypto && window.crypto.randomUUID)
        ? window.crypto.randomUUID()
        : 'kiosk-' + Math.random().toString(36).substring(2, 15)
      localStorage.setItem('kiosk_device_id', id)
    }
    setDeviceId(id)
    deviceIdRef.current = id

    // Liberar el candado del kiosco al cerrar la pestaña o ventana del navegador
    const handleUnload = () => {
      if (deviceIdRef.current) {
        liberarKiosco(deviceIdRef.current).catch(() => {})
      }
    }

    window.addEventListener('beforeunload', handleUnload)
    return () => {
      window.removeEventListener('beforeunload', handleUnload)
    }
  }, [])

  const fetchToken = useCallback(async (currentId?: string, isManualRetry = false) => {
    const activeId = currentId || deviceIdRef.current
    if (!activeId) return

    if (isManualRetry) setIsRetrying(true)

    try {
      const res = await generarTokenKiosco(activeId)

      if (res?.error === 'KIOSK_ALREADY_OPEN') {
        setIsBlocked(true)
        setBlockedMessage(res.message || 'Ya hay un kiosko abierto en otro dispositivo.')
        toast.warning('Ya hay un kiosko abierto en otro dispositivo', {
          id: 'kiosk-duplicate-warn',
          duration: 5000,
        })
      } else if (res?.success && res.token) {
        if (isBlocked) {
          setIsBlocked(false)
          setBlockedMessage('')
          toast.success('Kiosco activo y en línea', {
            id: 'kiosk-resumed',
            duration: 3000,
          })
        }
        setToken(res.token)
        setProgress(100) // Reiniciar barra de progreso
      } else if (res?.error === 'UNAUTHORIZED') {
        window.location.href = '/'
      }
    } catch (e) {
      console.error("Error obteniendo token del kiosco:", e)
    } finally {
      if (isManualRetry) setIsRetrying(false)
    }
  }, [isBlocked])

  useEffect(() => {
    if (!deviceId) return

    let isMounted = true

    // Reloj en tiempo real
    setTime(new Date())
    const clockInterval = setInterval(() => {
      setTime(new Date())
    }, 1000)

    // Ejecutar inmediatamente
    fetchToken(deviceId)

    // Consultar token cada 10 segundos (mantener heartbeat y token fresco)
    const intervalId = setInterval(() => {
      if (isMounted) fetchToken(deviceId)
    }, 10000)

    // Animación fluida de la barra de progreso (de 100 a 0 en 10s)
    const progressInterval = setInterval(() => {
      setProgress((prev) => Math.max(0, prev - (100 / (10000 / 100)))) 
    }, 100)

    return () => {
      isMounted = false
      clearInterval(clockInterval)
      clearInterval(intervalId)
      clearInterval(progressInterval)
    }
  }, [deviceId, fetchToken])

  // PANTALLA DE BLOQUEO SI YA HAY OTRO KIOSCO ABIERTO
  if (isBlocked) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-kiosco-aurora overflow-hidden relative selection:bg-none p-4">
        {/* Textura de puntos sutil */}
        <div 
          className="absolute inset-0 opacity-[0.45] pointer-events-none z-0"
          style={{
            backgroundImage: 'radial-gradient(circle, #64748b 1.5px, transparent 1.5px)',
            backgroundSize: '24px 24px'
          }}
        />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_transparent_30%,_#0f172a_100%)] pointer-events-none z-0 opacity-80" />

        <div className="relative z-10 w-full max-w-lg bg-slate-900/90 border border-amber-500/30 rounded-3xl p-8 sm:p-10 shadow-2xl backdrop-blur-xl text-center flex flex-col items-center">
          <div className="w-20 h-20 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mb-6 ring-8 ring-amber-500/5 animate-pulse">
            <MonitorX className="w-10 h-10 text-amber-400" />
          </div>

          <span className="text-xs font-bold uppercase tracking-widest text-amber-400 bg-amber-500/10 px-3 py-1 rounded-full border border-amber-500/20 mb-3">
            Sesión Exclusiva Restringida
          </span>

          <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight mb-3">
            Ya hay un kiosko abierto
          </h2>

          <p className="text-slate-300 text-sm sm:text-base leading-relaxed mb-6 font-normal">
            Actualmente ya existe una pantalla de Kiosco activa en otro dispositivo de la empresa. Por seguridad y prevención de marcas simultáneas, solo se permite un Kiosco activo.
          </p>

          <div className="bg-slate-800/80 rounded-2xl p-4 border border-slate-700/60 w-full mb-6 text-left flex items-start gap-3">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping shrink-0 mt-1.5" />
            <div className="text-xs text-slate-300 space-y-1">
              <p className="font-semibold text-slate-200">En espera automática:</p>
              <p className="text-slate-400">Si el otro dispositivo se cierra o apaga, este Kiosco tomará el control automáticamente en unos segundos.</p>
            </div>
          </div>

          <button
            onClick={() => fetchToken(deviceId, true)}
            disabled={isRetrying}
            className="w-full bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white font-bold py-3.5 px-5 rounded-2xl shadow-lg shadow-amber-500/20 transition-all flex items-center justify-center gap-2 text-sm disabled:opacity-70 active:scale-[0.98]"
          >
            <RefreshCw className={`w-4 h-4 ${isRetrying ? 'animate-spin' : ''}`} />
            <span>{isRetrying ? 'Verificando estado...' : 'Reintentar Conexión Ahora'}</span>
          </button>
        </div>
      </div>
    )
  }

  if (!token || !time) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900 text-white flex-col gap-4">
        <div className="relative">
          <Loader2 className="w-16 h-16 animate-spin text-blue-500" />
          <div className="absolute inset-0 rounded-full bg-blue-500/10 animate-ping" />
        </div>
        <span className="text-xl font-medium tracking-wide text-slate-300">Inicializando Kiosco Seguro...</span>
      </div>
    )
  }

  const timeFormatted = time.toLocaleTimeString('es-ES', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  })
  const dateFormatted = time.toLocaleDateString('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  })

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-kiosco-aurora overflow-hidden relative selection:bg-none">
      
      {/* Textura de puntos sutil — CSS puro */}
      <div 
        className="absolute inset-0 opacity-[0.45] pointer-events-none z-0"
        style={{
          backgroundImage: 'radial-gradient(circle, #64748b 1.5px, transparent 1.5px)',
          backgroundSize: '24px 24px'
        }}
      />
      {/* Viñeta para suavizar los bordes de la textura y dar profundidad */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_transparent_30%,_#0f172a_100%)] pointer-events-none z-0 opacity-80" />

      {/* Botón Discreto de Pantalla Completa */}
      <button
        onClick={toggleFullscreen}
        className="absolute top-5 right-5 z-20 p-3 rounded-2xl bg-white/5 hover:bg-white/10 text-white/60 hover:text-white backdrop-blur-md border border-white/10 transition-all active:scale-95 shadow-lg flex items-center gap-2 group"
        title={isFullscreen ? "Salir de pantalla completa" : "Pantalla completa"}
      >
        {isFullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
        <span className="text-xs font-medium pr-1 hidden group-hover:inline transition-all text-white/80">
          {isFullscreen ? 'Salir' : 'Pantalla Completa'}
        </span>
      </button>

      {/* Reloj Digital Enorme */}
      <div className="mb-10 text-center text-white drop-shadow-2xl z-10">
        <h1 className="text-7xl md:text-9xl font-extrabold tracking-tighter tabular-nums bg-clip-text text-transparent bg-gradient-to-b from-white to-slate-400">
          {timeFormatted}
        </h1>
        <p className="text-xl md:text-2xl text-slate-300 mt-2 font-medium capitalize tracking-wide opacity-90">
          {dateFormatted}
        </p>
      </div>

      {/* Contenedor del QR — Efecto "latido" sutil para indicar que está vivo */}
      <div className="relative z-10 w-full max-w-[320px] md:max-w-sm lg:max-w-md mx-auto px-4 md:px-0">
        {/* Anillo de pulso exterior */}
        <div className="absolute -inset-3 rounded-[3rem] bg-white/5 animate-pulse pointer-events-none" />
        <div className="bg-white p-6 md:p-10 rounded-[2rem] md:rounded-[2.5rem] shadow-2xl relative ring-8 ring-white/20 border-b-8 border-slate-200/50 transition-all">
          <QRCodeSVG 
            value={token} 
            size={380} 
            level="L"
            includeMargin={false}
            className="rounded-xl w-full h-auto"
          />
          
          {/* Indicador de actualización (Barra de progreso) */}
          <div className="mt-8">
            <div className="flex justify-between text-sm text-slate-600 font-bold uppercase tracking-wider mb-3">
              <span className="flex items-center gap-1.5 text-emerald-600 font-bold">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block animate-pulse" />
                Kiosco Exclusivo Activo
              </span>
              <span className="text-blue-600 tabular-nums">{Math.ceil(progress / 10)}s</span>
            </div>
            <div className="w-full bg-slate-200 rounded-full h-3 overflow-hidden shadow-inner">
              <div 
                className="h-full transition-all duration-100 ease-linear rounded-full"
                style={{ 
                  width: `${progress}%`,
                  background: progress > 30 
                    ? 'linear-gradient(90deg, #3b82f6, #06b6d4)' 
                    : 'linear-gradient(90deg, #f59e0b, #ef4444)'
                }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Instrucciones */}
      <div className="mt-12 text-center z-10 px-4">
        <p className="text-slate-300 text-xl md:text-2xl font-light max-w-2xl leading-relaxed">
          Abre la aplicación de empleado en tu teléfono y <strong className="font-bold text-white">escanea este código</strong> para registrar tu asistencia.
        </p>
      </div>

    </div>
  )
}
