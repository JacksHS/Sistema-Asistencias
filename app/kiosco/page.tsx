'use client'

import { useEffect, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { generarTokenKiosco } from '@/actions/kiosco'
import { ShieldCheck, Loader2, Maximize, Minimize } from 'lucide-react'

export default function KioscoPage() {
  const [token, setToken] = useState<string | null>(null)
  const [progress, setProgress] = useState(100)
  const [time, setTime] = useState<Date | null>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)

  const toggleFullscreen = () => {
    try {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {})
      } else {
        document.exitFullscreen().catch(() => {})
      }
    } catch (e) {
      // Ignorar si no está soportado
    }
  }

  useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement))
    }
    document.addEventListener('fullscreenchange', onFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange)
  }, [])

  useEffect(() => {
    let isMounted = true

    // Reloj en tiempo real
    setTime(new Date())
    const clockInterval = setInterval(() => {
      setTime(new Date())
    }, 1000)

    const fetchToken = async () => {
      try {
        const newToken = await generarTokenKiosco()
        if (isMounted) {
          setToken(newToken)
          setProgress(100) // Reiniciar barra de progreso
        }
      } catch (e) {
        console.error("Error obteniendo token del kiosco")
      }
    }

    // Ejecutar inmediatamente y luego cada 10 segundos
    fetchToken()
    const intervalId = setInterval(fetchToken, 10000)

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
  }, [])

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
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block animate-pulse" />
                Token Seguro
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
