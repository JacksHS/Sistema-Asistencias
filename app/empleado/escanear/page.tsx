'use client'

import { useState, useRef, useEffect } from 'react'
import { Scanner } from '@yudiel/react-qr-scanner'
import { 
  CheckCircle2, 
  XCircle, 
  LogOut, 
  Camera, 
  ClipboardList, 
  Clock, 
  Calendar, 
  RotateCw
} from 'lucide-react'
import { registrarAsistencia, obtenerResumenEmpleado } from '@/actions/asistencia'
import { motion, AnimatePresence } from 'framer-motion'
import confetti from 'canvas-confetti'
import { logout } from '@/actions/auth'

export default function EscanearPage() {
  const [tab, setTab] = useState<'escanear' | 'historial'>('escanear')
  const [escaneando, setEscaneando] = useState(true)
  const [estado, setEstado] = useState<'idle' | 'processing' | 'success' | 'error'>('idle')
  const [mensaje, setMensaje] = useState('')
  const [tipoMarca, setTipoMarca] = useState<'ENTRADA' | 'SALIDA' | null>(null)
  
  // Resumen del empleado (Estado de hoy e Historial 7 días)
  const [resumen, setResumen] = useState<any>(null)
  const [cargandoResumen, setCargandoResumen] = useState(true)

  // Ref para evitar múltiples escaneos por milisegundo (Closure problem)
  const isProcessingRef = useRef(false)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const scanAudioRef = useRef<HTMLAudioElement | null>(null)

  // Sonido de reconocimiento QR (Persiste en EscanearPage para que NO se corte cuando <Scanner /> se desmonta al pasar a 'processing')
  const playQrBeep = () => {
    // 1. Reproducir el beep nativo del lector QR desde el ref persistente del padre
    try {
      if (scanAudioRef.current) {
        scanAudioRef.current.currentTime = 0
        scanAudioRef.current.volume = 1.0
        const playPromise = scanAudioRef.current.play()
        if (playPromise !== undefined) {
          playPromise.catch(() => {
            // Si el navegador bloquea el elemento HTMLAudio, el sintetizador WebAudio actúa de respaldo inmediato
            playSuccessBeep()
          })
        }
      } else {
        playSuccessBeep()
      }
    } catch (e) {
      playSuccessBeep()
    }
  }

  // Sonido sintético de confirmación con Web Audio API (Respaldo + Confirmación de Entrada/Salida)
  const playSuccessBeep = () => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext
      if (!AudioCtx) return
      if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
        audioCtxRef.current = (window as any).__qrAudioCtx && (window as any).__qrAudioCtx.state !== 'closed'
          ? (window as any).__qrAudioCtx
          : new AudioCtx()
        ;(window as any).__qrAudioCtx = audioCtxRef.current
      }
      const ctx = audioCtxRef.current!
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {})
      }
      const now = ctx.currentTime

      const osc = ctx.createOscillator()
      const gain = ctx.createGain()

      // Tono nítido tipo escáner QR (D5 a A5)
      osc.type = 'sine'
      osc.frequency.setValueAtTime(587.33, now) // D5
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.09) // A5

      gain.gain.setValueAtTime(0.01, now)
      gain.gain.linearRampToValueAtTime(0.35, now + 0.025)
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.24)

      osc.connect(gain)
      gain.connect(ctx.destination)

      osc.start(now)
      osc.stop(now + 0.25)
    } catch (e) {
      // Ignorar si el navegador restringe audio
    }
  }

  // Cargar estado e historial del trabajador
  const cargarResumen = async () => {
    try {
      setCargandoResumen(true)
      const data = await obtenerResumenEmpleado()
      if (data && !data.error) {
        setResumen(data)
      }
    } catch (e) {
      console.error("Error cargando resumen de asistencia:", e)
    } finally {
      setCargandoResumen(false)
    }
  }

  useEffect(() => {
    cargarResumen()

    // Inicializar y pre-desbloquear el audio para móviles en el primer toque
    if (typeof window !== 'undefined') {
      try {
        // Extraemos el mismo recurso de audio del escáner pero en un ref que NO se destruye al desmontar la cámara
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext
        if (AudioCtx && !audioCtxRef.current) {
          audioCtxRef.current = new AudioCtx()
        }
      } catch (e) {}

      const unlockAudio = () => {
        try {
          if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
            audioCtxRef.current.resume().catch(() => {})
          }
        } catch (e) {}
      }

      window.addEventListener('pointerdown', unlockAudio, { passive: true })
      window.addEventListener('touchstart', unlockAudio, { passive: true })
      window.addEventListener('click', unlockAudio, { passive: true })

      return () => {
        window.removeEventListener('pointerdown', unlockAudio)
        window.removeEventListener('touchstart', unlockAudio)
        window.removeEventListener('click', unlockAudio)
      }
    }
  }, [])

  const handleScan = async (detectedCodes: any[]) => {
    if (isProcessingRef.current || !detectedCodes || detectedCodes.length === 0) return
    
    isProcessingRef.current = true
    const qrData = detectedCodes[0].rawValue

    // Mostrar inmediatamente la pantalla "Verificando..." encima de la cámara,
    // pero SIN desmontar <Scanner /> todavía (setEscaneando(false) se ejecuta al terminar los 800ms).
    // Esto evita que el cleanup de <Scanner /> ejecute audioRef.current.pause() en <1ms y corte el sonidito nativo del QR.
    setEstado('processing')
    playSuccessBeep()

    // Haptic feedback inmediato al detectar el QR
    try { if (typeof window !== 'undefined' && typeof navigator.vibrate === 'function') navigator.vibrate([100]) } catch(e) {}

    try {
      const [res] = await Promise.all([
        registrarAsistencia(qrData),
        new Promise(resolve => setTimeout(resolve, 800))
      ])
      
      // Ahora que el sonido del escáner ya terminó de reproducirse por completo, apagamos la cámara
      setEscaneando(false)

      if (res.error) {
        try { if (typeof window !== 'undefined' && typeof navigator.vibrate === 'function') navigator.vibrate([300, 100, 300]) } catch(e) {}
        setEstado('error')
        setMensaje(res.error)
      } else {
        // Reproducir confirmación sonora también al registrar Entrada o Salida exitosamente
        playSuccessBeep()

        try { if (typeof window !== 'undefined' && typeof navigator.vibrate === 'function') navigator.vibrate([200, 100, 200]) } catch(e) {}
        setEstado('success')
        // @ts-ignore
        setTipoMarca(res.tipo)
        setMensaje(res.success || 'Operación exitosa')
        
        confetti({
          particleCount: 100,
          spread: 70,
          origin: { y: 0.6 },
          colors: res.tipo === 'ENTRADA' ? ['#10b981', '#ffffff'] : ['#3b82f6', '#ffffff']
        })

        // Refrescar el estado y el historial de asistencias
        cargarResumen()
      }
    } catch (e) {
      setEscaneando(false)
      setEstado('error')
      setMensaje('Error de red al registrar asistencia')
    } finally {
      // Liberar siempre el candado cuando termina el procesamiento (la cámara ya está apagada con escaneando=false)
      // Así cuando el trabajador vuelva a abrir el escáner para marcar su salida o verificar su estado, siempre procesará el QR
      isProcessingRef.current = false
    }
  }

  const reintentar = () => {
    isProcessingRef.current = false
    setEstado('idle')
    setMensaje('')
    setTipoMarca(null)
    setEscaneando(true)
  }

  // Spinner de procesamiento
  const processingScreen = (
    <div className="absolute inset-0 flex items-center justify-center p-6 bg-slate-900/95 backdrop-blur-sm z-20">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="flex flex-col items-center gap-6 text-center"
      >
        <div className="relative">
          <div className="w-20 h-20 rounded-full border-4 border-slate-700 border-t-emerald-400 animate-spin" />
          <div className="absolute inset-0 rounded-full bg-emerald-400/10 animate-ping" />
        </div>
        <div>
          <p className="text-white font-bold text-xl tracking-wide">Verificando...</p>
          <p className="text-slate-400 text-sm mt-1">Conectando con el servidor</p>
        </div>
      </motion.div>
    </div>
  )

  const estadoHoy = resumen?.estadoHoy

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col text-white pb-20">
      
      {/* Header Superior */}
      <header className="p-4 bg-slate-900 border-b border-slate-800 flex justify-between items-center z-20 shadow-sm relative overflow-hidden">
        {/* Textura de puntos sutil */}
        <div 
          className="absolute inset-0 opacity-[0.45] pointer-events-none z-0"
          style={{
            backgroundImage: 'radial-gradient(circle, #64748b 1.5px, transparent 1.5px)',
            backgroundSize: '24px 24px'
          }}
        />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_transparent_30%,_#0f172a_100%)] pointer-events-none z-0 opacity-80" />

        <div className="flex items-center gap-2.5 relative z-10">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
            <Camera className="w-4 h-4" />
          </div>
          <div>
            <h1 className="font-bold text-sm tracking-wide leading-tight">Control de Asistencias</h1>
            <p className="text-[11px] text-slate-400">
              {resumen?.nombre ? resumen.nombre.split(' ')[0] : 'Trabajador'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 relative z-10">
          <form action={logout}>
            <button 
              type="submit"
              className="p-2 text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700/60 rounded-xl transition-all active:scale-95"
              title="Cerrar Sesión"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </form>
        </div>
      </header>

      {/* Barra / Badge de Estado en Vivo (Justo debajo del Nav) */}
      <div className="bg-slate-950/60 border-b border-slate-800/80 px-4 py-2.5 flex items-center justify-between z-10 text-xs">
        <span className="text-slate-400 font-medium flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.5 text-slate-500" />
          Estado hoy:
        </span>
        {cargandoResumen ? (
          <span className="text-slate-500 animate-pulse text-[11px]">Sincronizando...</span>
        ) : estadoHoy?.tipo === 'DENTRO' ? (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 font-semibold text-[11px]">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            En oficina (Entrada: {estadoHoy.horaEntrada})
          </span>
        ) : estadoHoy?.tipo === 'COMPLETADA' ? (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/30 text-blue-300 font-semibold text-[11px]">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
            Jornada finalizada (Salida: {estadoHoy.horaSalida})
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-slate-300 font-semibold text-[11px]">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
            Jornada no iniciada
          </span>
        )}
      </div>

      {/* Contenido Principal según la Pestaña Activa */}
      <main className="flex-1 flex flex-col relative overflow-hidden md:items-center md:justify-center md:p-6">
        
        {/* VISTA 1: ESCÁNER QR */}
        {tab === 'escanear' && (
          <>
            {estado === 'processing' && processingScreen}
            {escaneando ? (
              <div className="absolute inset-0 md:relative md:w-full md:max-w-md md:max-h-[75vh] md:rounded-2xl md:overflow-hidden md:shadow-2xl md:ring-1 md:ring-white/10 flex flex-col z-10">
                <div className="relative flex-1 bg-black">
                  <Scanner 
                    onScan={handleScan}
                    formats={['qr_code']}
                    components={{
                      zoom: true,
                      finder: false
                    }}
                    styles={{
                      container: { width: '100%', height: '100%' },
                      video: { objectFit: 'cover' }
                    }}
                  />
                  
                  {/* Overlay Animado Láser */}
                  <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none overflow-hidden">
                    <div className="relative w-[280px] h-[280px] rounded-3xl shadow-[0_0_0_4000px_rgba(0,0,0,0.6)]">
                      <motion.div
                        animate={{ scale: [1, 1.05, 1], opacity: [0.7, 1, 0.7] }}
                        transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
                        className="absolute inset-0"
                      >
                        <div className="absolute top-0 left-0 w-12 h-12 border-t-4 border-l-4 border-emerald-400 rounded-tl-3xl" />
                        <div className="absolute top-0 right-0 w-12 h-12 border-t-4 border-r-4 border-emerald-400 rounded-tr-3xl" />
                        <div className="absolute bottom-0 left-0 w-12 h-12 border-b-4 border-l-4 border-emerald-400 rounded-bl-3xl" />
                        <div className="absolute bottom-0 right-0 w-12 h-12 border-b-4 border-r-4 border-emerald-400 rounded-br-3xl" />
                      </motion.div>

                      {/* Línea Láser */}
                      <motion.div
                        animate={{ top: ['0%', '98%', '0%'] }}
                        transition={{ duration: 2.5, repeat: Infinity, ease: "linear" }}
                        className="absolute left-3 right-3 h-0.5 bg-emerald-400 shadow-[0_0_12px_4px_rgba(52,211,153,0.6)]"
                      />
                    </div>
                  </div>

                  <div className="absolute bottom-8 left-0 right-0 text-center px-4 z-20">
                    <div className="bg-black/70 backdrop-blur-md text-white py-2.5 px-5 rounded-full inline-block border border-white/10 shadow-xl">
                      <p className="font-medium tracking-wide text-xs">Apunta al código QR del Kiosco</p>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              /* Modal de Resultado */
              <div className="absolute inset-0 flex items-center justify-center p-6 bg-slate-900/90 backdrop-blur-sm z-20">
                <AnimatePresence>
                  <motion.div 
                    key="result"
                    initial={{ opacity: 0, y: 20, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ type: 'spring', bounce: 0.3 }}
                    className={`backdrop-blur-xl rounded-3xl p-7 max-w-sm w-full text-center shadow-2xl border transition-all ${
                      estado === 'success'
                        ? tipoMarca === 'ENTRADA'
                          ? 'bg-slate-800/95 border-emerald-500/30 shadow-emerald-500/10'
                          : 'bg-slate-800/95 border-blue-500/30 shadow-blue-500/10'
                        : 'bg-slate-800/95 border-red-500/30 shadow-red-500/10'
                    }`}
                  >
                    {estado === 'success' ? (
                      <motion.div 
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ type: 'spring', bounce: 0.5, delay: 0.1 }}
                        className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-5 ring-4 ${
                          tipoMarca === 'ENTRADA' 
                            ? 'bg-emerald-500/20 text-emerald-400 ring-emerald-500/30 shadow-lg shadow-emerald-500/20' 
                            : 'bg-blue-500/20 text-blue-400 ring-blue-500/30 shadow-lg shadow-blue-500/20'
                        }`}
                      >
                        <CheckCircle2 className="w-12 h-12" />
                      </motion.div>
                    ) : (
                      <motion.div 
                        initial={{ scale: 0, rotate: -90 }}
                        animate={{ scale: 1, rotate: 0 }}
                        transition={{ type: 'spring', bounce: 0.5 }}
                        className="w-20 h-20 bg-red-500/20 text-red-400 rounded-full flex items-center justify-center mx-auto mb-5 ring-4 ring-red-500/30 shadow-lg shadow-red-500/20"
                      >
                        <XCircle className="w-12 h-12" />
                      </motion.div>
                    )}
                    
                    <h2 className={`text-2xl font-bold mb-1.5 ${
                      estado === 'success'
                        ? tipoMarca === 'ENTRADA' ? 'text-emerald-300' : 'text-blue-300'
                        : (mensaje.includes('Ya registraste') || mensaje.includes('Ya completaste'))
                          ? 'text-amber-300'
                          : 'text-red-300'
                    }`}>
                      {estado === 'success' 
                        ? (tipoMarca === 'ENTRADA' ? '¡Entrada Registrada!' : '¡Salida Registrada!') 
                        : (mensaje.includes('Ya registraste') || mensaje.includes('Ya completaste'))
                          ? 'Marca ya Registrada'
                          : 'Escaneo Fallido'}
                    </h2>
                    
                    <p className="text-slate-300 mb-6 text-sm leading-relaxed">{mensaje}</p>
                    
                    {estado === 'success' ? (
                      <div className="space-y-3">
                        {/* Botón Ver Mi Historial */}
                        <button
                          onClick={() => {
                            isProcessingRef.current = false
                            setTab('historial')
                            setEstado('idle')
                          }}
                          className="w-full flex justify-center items-center gap-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-semibold py-3.5 px-4 rounded-xl transition-all active:scale-95 shadow-lg shadow-emerald-600/20"
                        >
                          <ClipboardList className="w-4 h-4" />
                          Ver Mi Historial de Asistencias
                        </button>

                        {/* Botón Volver al Escáner */}
                        <button
                          onClick={reintentar}
                          className="w-full flex justify-center items-center gap-2 bg-slate-700/90 hover:bg-slate-600 text-white font-medium py-3 px-4 rounded-xl transition-all active:scale-95 border border-slate-600/60 text-sm"
                        >
                          <Camera className="w-4 h-4 text-emerald-400" />
                          Volver al Escáner
                        </button>

                        {/* Botón Cerrar Sesión */}
                        <form action={logout}>
                          <button
                            type="submit"
                            className="w-full flex justify-center items-center gap-2 bg-slate-800/80 hover:bg-slate-700 text-slate-300 font-medium py-2.5 px-4 rounded-xl transition-all active:scale-95 border border-slate-700/50 text-sm"
                          >
                            <LogOut className="w-4 h-4" />
                            Cerrar Sesión
                          </button>
                        </form>
                      </div>
                    ) : (
                      <button
                        onClick={reintentar}
                        className="w-full bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 text-white font-semibold py-3.5 rounded-xl transition-all duration-200 active:scale-95 shadow-lg shadow-blue-500/20"
                      >
                        🔄 Reintentar Escaneo
                      </button>
                    )}
                  </motion.div>
                </AnimatePresence>
              </div>
            )}
          </>
        )}

        {/* VISTA 2: MI HISTORIAL (ÚLTIMOS 7 DÍAS) */}
        {tab === 'historial' && (
          <div className="w-full max-w-md mx-auto p-4 flex flex-col gap-4 overflow-y-auto max-h-[calc(100vh-140px)]">
            
            {/* Cabecera del Historial */}
            <div className="flex items-center justify-between pt-1">
              <div>
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <ClipboardList className="w-5 h-5 text-emerald-400" />
                  Mi Historial Reciente
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">Últimos 7 días laborales</p>
              </div>
              <button
                onClick={cargarResumen}
                disabled={cargandoResumen}
                className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl border border-slate-700/60 transition-colors active:scale-95 disabled:opacity-50"
                title="Actualizar historial"
              >
                <RotateCw className={`w-4 h-4 ${cargandoResumen ? 'animate-spin' : ''}`} />
              </button>
            </div>

            {/* Listado de Días */}
            {cargandoResumen ? (
              <div className="flex flex-col gap-3 py-6">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-24 rounded-2xl bg-slate-800/50 animate-pulse border border-slate-800" />
                ))}
              </div>
            ) : resumen?.historial && resumen.historial.length > 0 ? (
              <div className="flex flex-col gap-3">
                {resumen.historial.map((item: any, index: number) => (
                  <motion.div
                    key={index}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className={`p-4 rounded-2xl border transition-all ${
                      item.esHoy
                        ? 'bg-gradient-to-br from-slate-800 to-slate-800/80 border-emerald-500/40 shadow-lg shadow-emerald-500/5'
                        : 'bg-slate-800/60 border-slate-700/50'
                    }`}
                  >
                    {/* Encabezado del Día */}
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-slate-400" />
                        <span className="font-semibold text-sm capitalize text-white">
                          {item.fechaTexto}
                        </span>
                      </div>
                      {item.esHoy && (
                        <span className="px-2 py-0.5 text-[10px] font-bold uppercase rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                          Hoy
                        </span>
                      )}
                    </div>

                    {/* Fila de Marcas: Entrada y Salida */}
                    <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-700/40">
                      {/* Entrada */}
                      <div className="flex flex-col">
                        <span className="text-[11px] text-slate-400 font-medium">Entrada</span>
                        <div className="flex items-baseline gap-1.5 mt-0.5">
                          <span className="text-sm font-bold text-white tracking-wide">
                            {item.entrada}
                          </span>
                        </div>
                        <div className="mt-1">
                          {item.esTarde ? (
                            <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                              Tardanza
                            </span>
                          ) : (
                            <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                              Puntual
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Salida */}
                      <div className="flex flex-col">
                        <span className="text-[11px] text-slate-400 font-medium">Salida</span>
                        <div className="flex items-baseline gap-1.5 mt-0.5">
                          <span className="text-sm font-bold text-white tracking-wide">
                            {item.salida}
                          </span>
                        </div>
                        <div className="mt-1">
                          {item.enCurso ? (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-500/20 text-blue-300 border border-blue-500/30">
                              <span className="w-1 h-1 rounded-full bg-blue-400 animate-pulse" />
                              En curso
                            </span>
                          ) : item.sinSalida ? (
                            <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-800 text-slate-400 border border-slate-700/80">
                              No registrado
                            </span>
                          ) : (
                            <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-700 text-slate-300">
                              Completada
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            ) : (
              /* Estado Vacío */
              <div className="text-center py-12 px-6 bg-slate-800/40 border border-slate-800 rounded-3xl">
                <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-400">
                  <Calendar className="w-7 h-7" />
                </div>
                <h3 className="font-semibold text-white text-base">Sin asistencias recientes</h3>
                <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto">
                  Aún no tienes marcas de asistencia registradas en los últimos 7 días.
                </p>
                <button
                  onClick={() => {
                    isProcessingRef.current = false
                    setEstado('idle')
                    setTab('escanear')
                    setEscaneando(true)
                  }}
                  className="mt-5 inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-xl transition-all active:scale-95"
                >
                  <Camera className="w-3.5 h-3.5" />
                  Ir al Escáner
                </button>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Barra de Navegación Inferior Fija (Bottom Navigation Bar) */}
      <nav className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-slate-900/95 backdrop-blur-xl border-t border-slate-800 px-6 py-2 flex justify-around items-center z-30 shadow-2xl">
        {/* Botón 1: Cámara / Escáner */}
        <button
          onClick={() => {
            setTab('escanear')
            if (estado !== 'processing') {
              isProcessingRef.current = false
              setEscaneando(true)
              setEstado('idle')
            }
            try { if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(30) } catch(e) {}
          }}
          className={`flex flex-col items-center gap-1 py-1 px-4 rounded-xl transition-all active:scale-95 ${
            tab === 'escanear' 
              ? 'text-emerald-400 font-semibold' 
              : 'text-slate-400 hover:text-slate-200 font-normal'
          }`}
        >
          <div className={`p-1 rounded-lg transition-colors ${tab === 'escanear' ? 'bg-emerald-500/10' : ''}`}>
            <Camera className="w-5 h-5" />
          </div>
          <span className="text-[11px] tracking-wide">Escáner</span>
        </button>

        {/* Botón 2: Mi Historial (Tablita con rayitas de hoja) */}
        <button
          onClick={() => {
            setTab('historial')
            setEscaneando(false)
            try { if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(30) } catch(e) {}
          }}
          className={`flex flex-col items-center gap-1 py-1 px-4 rounded-xl transition-all active:scale-95 ${
            tab === 'historial' 
              ? 'text-emerald-400 font-semibold' 
              : 'text-slate-400 hover:text-slate-200 font-normal'
          }`}
        >
          <div className={`p-1 rounded-lg transition-colors ${tab === 'historial' ? 'bg-emerald-500/10' : ''}`}>
            <ClipboardList className="w-5 h-5" />
          </div>
          <span className="text-[11px] tracking-wide">Mi Historial</span>
        </button>
      </nav>

    </div>
  )
}
