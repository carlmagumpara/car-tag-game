import { memo, useEffect, useRef } from 'react'
import { updateEngine } from './game/audio.js'
import { NETWORK, PHYSICS } from './game/constants.js'
import { getDriveAxis } from './game/input.js'
import { sampleState } from './game/interpolation.js'
import { createVehicle, getDisplaySpeed, stepVehicle } from './game/physics.js'
import { createCityCanvas, renderScene } from './game/renderer.js'
import { world } from './game/world.js'

const clamp = (value, min, max) => Math.min(Math.max(value, min), max)

function applyTagFlash(car, tagFlash, now) {
  if (!tagFlash || (tagFlash.taggedId !== car.id && tagFlash.taggerId !== car.id)) {
    car.flash = 0
    return
  }
  car.flash = Math.max(0, 1 - (now - tagFlash.startedAt) / 1200)
  car.flashColor = tagFlash.taggedId === car.id ? '#f87171' : '#22d3ee'
}

function compactLifetimes(list, deltaMs) {
  let write = 0
  for (let i = 0; i < list.length; i += 1) {
    list[i].life -= deltaMs
    if (list[i].life > 0) {
      list[write] = list[i]
      write += 1
    }
  }
  list.length = write
}

function GameCanvas({ inputRef, playersRef, self, sendMove, onHudUpdate, paused, tagEvent }) {
  const containerRef = useRef(null)
  const canvasRef = useRef(null)
  const ctxRef = useRef(null)
  const cityCanvasRef = useRef(null)
  const sizeRef = useRef({ width: 800, height: 600, dpr: 1 })
  const pausedRef = useRef(paused)
  const sendMoveRef = useRef(sendMove)
  const hudRef = useRef(onHudUpdate)
  const localRef = useRef(null)
  const cameraRef = useRef({ x: 0, y: 0, ready: false })
  const skidsRef = useRef([])
  const particlesRef = useRef([])
  const scratchRef = useRef({})
  const remotesRef = useRef([])
  const lastSkidRef = useRef(0)
  const tagFlashRef = useRef(null)

  useEffect(() => {
    pausedRef.current = paused
  }, [paused])

  useEffect(() => {
    sendMoveRef.current = sendMove
  }, [sendMove])

  useEffect(() => {
    hudRef.current = onHudUpdate
  }, [onHudUpdate])

  useEffect(() => {
    tagFlashRef.current = tagEvent ? { ...tagEvent, startedAt: performance.now() } : null
  }, [tagEvent])

  // A new self id means a fresh connection: reset local simulation state.
  // Tag updates change the same object, so they must not teleport the car.
  useEffect(() => {
    if (!self || localRef.current?.id === self.id) return
    localRef.current = createVehicle({
      id: self.id,
      name: self.name,
      color: self.color,
      x: self.x,
      y: self.y,
      angle: self.angle,
    })
    cameraRef.current.ready = false
    skidsRef.current.length = 0
    particlesRef.current.length = 0
  }, [self?.id, self])

  useEffect(() => {
    if (!localRef.current || !self) return
    localRef.current.isIt = Boolean(self.isIt)
    localRef.current.tags = self.tags || 0
    localRef.current.immuneUntil = self.immuneUntil || 0
  }, [self])

  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return undefined

    const resize = () => {
      const rect = container.getBoundingClientRect()
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const width = Math.max(1, Math.round(rect.width))
      const height = Math.max(1, Math.round(rect.height))
      canvas.width = Math.floor(width * dpr)
      canvas.height = Math.floor(height * dpr)
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
      sizeRef.current = { width, height, dpr }
      ctxRef.current = canvas.getContext('2d')
      // Built once: the city never changes, so only cars/effects redraw per frame.
      if (!cityCanvasRef.current) cityCanvasRef.current = createCityCanvas(world)
    }

    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    let raf = 0
    let last = performance.now()
    let lastSend = 0
    let lastHud = 0

    const loop = (now) => {
      raf = requestAnimationFrame(loop)
      const ctx = ctxRef.current
      if (!ctx) return
      const dt = Math.min((now - last) / 1000, 0.05)
      last = now
      const { width, height, dpr } = sizeRef.current
      const local = localRef.current
      const camera = cameraRef.current
      const active = Boolean(local) && !pausedRef.current && !document.hidden
      let accelerating = false

      if (active) {
        const axis = getDriveAxis(inputRef.current)
        accelerating = Boolean(axis.throttle || axis.reverse)
        stepVehicle(local, axis, dt, world)

        // Visual-only suspension cues: never fed back into the physics model.
        const visualSmoothing = 1 - Math.exp(-12 * dt)
        local.steerVisual = (local.steerVisual || 0) + (axis.steer - (local.steerVisual || 0)) * visualSmoothing
        const rollTarget =
          (local.steerVisual || 0) *
          Math.min(Math.abs(local.speed) / PHYSICS.maxForwardSpeed, 1) *
          (local.drifting ? 1.6 : 1)
        local.roll = (local.roll || 0) + (rollTarget - (local.roll || 0)) * visualSmoothing
        local.braking = axis.handbrake || axis.reverse

        if (local.drifting && Math.abs(local.speed) > 40 && now - lastSkidRef.current > 28) {
          lastSkidRef.current = now
          const cos = Math.cos(local.angle)
          const sin = Math.sin(local.angle)
          for (const side of [-1, 1]) {
            const offsetX = -sin * 8 * side
            const offsetY = cos * 8 * side
            skidsRef.current.push({
              x: local.x - cos * 12 + offsetX,
              y: local.y - sin * 12 + offsetY,
              angle: local.angle,
              life: 1400,
              maxLife: 1400,
            })
            particlesRef.current.push({
              x: local.x - cos * 16 + offsetX,
              y: local.y - sin * 16 + offsetY,
              r: 2 + Math.random() * 2,
              color: '#94a3b8',
              life: 420,
              maxLife: 420,
            })
          }
          if (skidsRef.current.length > 220) skidsRef.current.splice(0, skidsRef.current.length - 220)
          if (particlesRef.current.length > 120) particlesRef.current.splice(0, particlesRef.current.length - 120)
        }

        // In-place lifetime compaction: no per-frame array allocations.
        compactLifetimes(skidsRef.current, dt * 1000)
        compactLifetimes(particlesRef.current, dt * 1000)

        const targetX = clamp(local.x - width / 2, 0, Math.max(0, world.width - width))
        const targetY = clamp(local.y - height / 2, 0, Math.max(0, world.height - height))
        if (!camera.ready) {
          camera.x = targetX
          camera.y = targetY
          camera.ready = true
        } else {
          const smoothing = 1 - Math.exp(-7 * dt)
          camera.x += (targetX - camera.x) * smoothing
          camera.y += (targetY - camera.y) * smoothing
        }

        if (now - lastSend >= NETWORK.sendIntervalMs) {
          sendMoveRef.current({
            x: local.x,
            y: local.y,
            angle: local.angle,
            speed: local.speed,
          })
          lastSend = now
        }
      }

      updateEngine(local?.speed || 0, accelerating, active)

      const scratch = scratchRef.current
      const remotes = remotesRef.current
      remotes.length = 0
      for (const entry of playersRef.current.values()) {
        const state = sampleState(entry.buffer, now, NETWORK.interpolationDelayMs, scratch)
        if (state) {
          remotes.push({
            id: entry.info.id,
            name: entry.info.name,
            color: entry.info.color,
            x: state.x,
            y: state.y,
            angle: state.angle,
            speed: state.speed,
            drifting: false,
            steer: 0,
            roll: 0,
            braking: false,
            isIt: Boolean(entry.info.isIt),
            tags: entry.info.tags || 0,
            immuneUntil: entry.info.immuneUntil || 0,
          })
        }
      }

      const flash = tagFlashRef.current
      if (local) applyTagFlash(local, flash, now)
      for (const remote of remotes) applyTagFlash(remote, flash, now)

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.save()
      ctx.translate(-camera.x, -camera.y)
      renderScene(ctx, {
        cityCanvas: cityCanvasRef.current,
        world,
        camera,
        viewWidth: width,
        viewHeight: height,
        local,
        remotes,
        skids: skidsRef.current,
        particles: particlesRef.current,
        now,
      })
      ctx.restore()

      if (local && now - lastHud >= NETWORK.hudIntervalMs) {
        hudRef.current?.({
          speed: getDisplaySpeed(local),
          drifting: local.drifting,
          x: Math.round(local.x),
          y: Math.round(local.y),
        })
        lastHud = now
      }
    }

    raf = requestAnimationFrame(loop)
    // Reset the clock after background-tab suspension so we never simulate a
    // huge delta in one frame.
    const onVisibility = () => {
      last = performance.now()
    }
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      cancelAnimationFrame(raf)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [inputRef, playersRef])

  return (
    <div ref={containerRef} className="absolute inset-0">
      <canvas
        ref={canvasRef}
        className="block h-full w-full touch-none"
        aria-label="Top-down view of the shared city. Use the controls to drive."
      />
    </div>
  )
}

export default memo(GameCanvas)
