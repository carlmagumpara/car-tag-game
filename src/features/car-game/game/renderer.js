import { WORLD } from './constants.js'

const PALETTE = {
  ground: '#101823',
  asphalt: '#2a3441',
  sidewalk: '#3a4654',
  curb: '#596879',
  park: '#1b3a2d',
  parkPath: '#4c5f52',
  lot: '#2b3542',
  building: ['#34455a', '#2d3d50', '#3a4a5e', '#2a394c'],
  tree: ['#2f7d50', '#276b45', '#378c59'],
  skid: 'rgba(6, 10, 16, 0.55)',
}

function hexToRgb(hex) {
  const value = hex.replace('#', '')
  const full = value.length === 3 ? value.split('').map((char) => char + char).join('') : value
  const number = Number.parseInt(full, 16)
  return { r: (number >> 16) & 255, g: (number >> 8) & 255, b: number & 255 }
}

function shade(hex, amount) {
  const { r, g, b } = hexToRgb(hex)
  const target = amount < 0 ? 0 : 255
  const strength = Math.abs(amount)
  return `rgb(${Math.round(r + (target - r) * strength)}, ${Math.round(g + (target - g) * strength)}, ${Math.round(b + (target - b) * strength)})`
}

function withAlpha(hex, alpha) {
  const { r, g, b } = hexToRgb(hex)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function roundedRect(ctx, x, y, width, height, radius) {
  ctx.beginPath()
  if (ctx.roundRect) {
    ctx.roundRect(x, y, width, height, radius)
    return
  }
  const r = Math.min(radius, width / 2, height / 2)
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + width - r, y)
  ctx.quadraticCurveTo(x + width, y, x + width, y + r)
  ctx.lineTo(x + width, y + height - r)
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height)
  ctx.lineTo(x + r, y + height)
  ctx.quadraticCurveTo(x, y + height, x, y + height - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
}

function noisePattern(seed, color, count = 2200, size = 256) {
  const tile = document.createElement('canvas')
  tile.width = size
  tile.height = size
  const ctx = tile.getContext('2d')
  let value = seed >>> 0
  const random = () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0
    return value / 4294967296
  }
  ctx.fillStyle = color
  for (let i = 0; i < count; i += 1) {
    ctx.globalAlpha = 0.04 + random() * 0.1
    ctx.fillRect(random() * size, random() * size, 1 + random() * 2, 1 + random() * 2)
  }
  ctx.globalAlpha = 1
  return ctx.createPattern(tile, 'repeat')
}

function drawGround(ctx, world) {
  ctx.fillStyle = PALETTE.ground
  ctx.fillRect(0, 0, world.width, world.height)
  ctx.fillStyle = noisePattern(world.seed, '#94a3b8', 9000)
  ctx.fillRect(0, 0, world.width, world.height)
}

function drawBlockBases(ctx, world) {
  const asphaltNoise = noisePattern(world.seed + 11, '#dbe4ee', 5000)
  for (const block of world.blocks) {
    if (block.type === 'park') {
      ctx.fillStyle = PALETTE.park
      ctx.fillRect(block.x, block.y, block.size, block.size)
      ctx.fillStyle = noisePattern(block.seed, '#86efac', 2200)
      ctx.fillRect(block.x, block.y, block.size, block.size)
      ctx.fillStyle = PALETTE.parkPath
      ctx.fillRect(block.pathX - 7, block.y, 14, block.size)
      ctx.fillRect(block.x, block.pathY - 7, block.size, 14)
      continue
    }
    if (block.type === 'lot') {
      ctx.fillStyle = PALETTE.lot
      ctx.fillRect(block.x, block.y, block.size, block.size)
      ctx.fillStyle = asphaltNoise
      ctx.fillRect(block.x, block.y, block.size, block.size)
      ctx.strokeStyle = 'rgba(226, 232, 240, 0.35)'
      ctx.lineWidth = 1.5
      for (let i = 0; i < 6; i += 1) {
        const x = block.x + 18 + i * 31
        ctx.beginPath()
        ctx.moveTo(x, block.y + 76)
        ctx.lineTo(x, block.y + block.size - 14)
        ctx.stroke()
      }
      continue
    }
    ctx.fillStyle = '#1a2531'
    ctx.fillRect(block.x, block.y, block.size, block.size)
    ctx.fillStyle = noisePattern(block.seed, '#94a3b8', 1200)
    ctx.fillRect(block.x, block.y, block.size, block.size)
  }
}

function drawRoadStrip(ctx, world, noise) {
  const { roadWidth, sidewalk, width, height } = world
  const half = roadWidth / 2
  const outer = half + sidewalk
  const outerSize = (outer + 4) * 2

  for (const x of world.roadsX) {
    ctx.fillStyle = '#0d141d'
    ctx.fillRect(x - outer - 4, 0, outerSize, height)
    ctx.fillStyle = PALETTE.sidewalk
    ctx.fillRect(x - outer, 0, outer * 2, height)
    ctx.fillStyle = noise
    ctx.fillRect(x - outer, 0, outer * 2, height)
    ctx.fillStyle = PALETTE.curb
    ctx.fillRect(x - half - 2, 0, 2, height)
    ctx.fillRect(x + half, 0, 2, height)
    ctx.fillStyle = PALETTE.asphalt
    ctx.fillRect(x - half, 0, roadWidth, height)
    ctx.fillStyle = noise
    ctx.fillRect(x - half, 0, roadWidth, height)
    ctx.fillStyle = 'rgba(226, 232, 240, 0.22)'
    ctx.fillRect(x - half + 7, 0, 1.5, height)
    ctx.fillRect(x + half - 8.5, 0, 1.5, height)
    ctx.fillStyle = 'rgba(250, 204, 21, 0.72)'
    ctx.fillRect(x - 2.5, 0, 2, height)
    ctx.fillRect(x + 0.5, 0, 2, height)
  }

  for (const y of world.roadsY) {
    ctx.fillStyle = '#0d141d'
    ctx.fillRect(0, y - outer - 4, width, outerSize)
    ctx.fillStyle = PALETTE.sidewalk
    ctx.fillRect(0, y - outer, width, outer * 2)
    ctx.fillStyle = noise
    ctx.fillRect(0, y - outer, width, outer * 2)
    ctx.fillStyle = PALETTE.curb
    ctx.fillRect(0, y - half - 2, width, 2)
    ctx.fillRect(0, y + half, width, 2)
    ctx.fillStyle = PALETTE.asphalt
    ctx.fillRect(0, y - half, width, roadWidth)
    ctx.fillStyle = noise
    ctx.fillRect(0, y - half, width, roadWidth)
    ctx.fillStyle = 'rgba(226, 232, 240, 0.22)'
    ctx.fillRect(0, y - half + 7, width, 1.5)
    ctx.fillRect(0, y + half - 8.5, width, 1.5)
    ctx.fillStyle = 'rgba(250, 204, 21, 0.72)'
    ctx.fillRect(0, y - 2.5, width, 2)
    ctx.fillRect(0, y + 0.5, width, 2)
  }
}

function drawIntersections(ctx, world, noise) {
  const half = WORLD.roadWidth / 2
  for (const x of world.roadsX) {
    for (const y of world.roadsY) {
      ctx.fillStyle = PALETTE.asphalt
      ctx.fillRect(x - half, y - half, WORLD.roadWidth, WORLD.roadWidth)
      ctx.fillStyle = noise
      ctx.fillRect(x - half, y - half, WORLD.roadWidth, WORLD.roadWidth)
      ctx.fillStyle = 'rgba(226, 232, 240, 0.6)'
      for (let i = 0; i < 5; i += 1) {
        const offset = 9 + i * 10
        const band = WORLD.roadWidth - 14
        ctx.fillRect(x - half + 7, y - half - offset, band, 5)
        ctx.fillRect(x - half + 7, y + half + offset, band, 5)
        ctx.fillRect(x - half - offset, y - half + 7, 5, band)
        ctx.fillRect(x + half + offset, y - half + 7, 5, band)
      }
      ctx.fillStyle = 'rgba(241, 245, 249, 0.5)'
      ctx.fillRect(x - half + 7, y - half - 5, WORLD.roadWidth - 14, 2)
      ctx.fillRect(x - half + 7, y + half + 3, WORLD.roadWidth - 14, 2)
      ctx.fillRect(x - half - 5, y - half + 7, 2, WORLD.roadWidth - 14)
      ctx.fillRect(x + half + 3, y - half + 7, 2, WORLD.roadWidth - 14)
    }
  }
}

function drawBuilding(ctx, building) {
  const base = PALETTE.building[building.tone]
  const seed = building.seed
  ctx.fillStyle = 'rgba(0, 0, 0, 0.48)'
  ctx.fillRect(building.x + 8, building.y + 9, building.w, building.h)

  const wall = ctx.createLinearGradient(building.x, building.y, building.x + building.w, building.y + building.h)
  wall.addColorStop(0, shade(base, 0.22))
  wall.addColorStop(1, shade(base, -0.3))
  roundedRect(ctx, building.x, building.y, building.w, building.h, 3)
  ctx.fillStyle = wall
  ctx.fill()
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)'
  ctx.lineWidth = 1
  ctx.stroke()

  const inset = 5
  const roofX = building.x + inset
  const roofY = building.y + inset
  const roofW = building.w - inset * 2
  const roofH = building.h - inset * 2
  if (roofW > 12 && roofH > 12) {
    ctx.fillStyle = shade(base, -0.42)
    ctx.fillRect(roofX, roofY, roofW, roofH)
    ctx.strokeStyle = 'rgba(226, 232, 240, 0.18)'
    ctx.strokeRect(roofX + 0.5, roofY + 0.5, roofW - 1, roofH - 1)

    // Rooftop equipment and skylights, deterministic per building.
    const units = 1 + (seed % 3)
    for (let i = 0; i < units; i += 1) {
      const unitX = roofX + 6 + ((seed * (i + 3)) % Math.max(8, roofW - 24))
      const unitY = roofY + 6 + ((seed * (i + 5)) % Math.max(8, roofH - 24))
      ctx.fillStyle = 'rgba(0, 0, 0, 0.35)'
      ctx.fillRect(unitX + 2, unitY + 2, 13, 10)
      ctx.fillStyle = '#7c8a9c'
      ctx.fillRect(unitX, unitY, 13, 10)
      ctx.fillStyle = 'rgba(15, 23, 42, 0.6)'
      ctx.fillRect(unitX + 2, unitY + 2, 9, 5)
    }
    if (seed % 2 === 0 && roofW > 40) {
      ctx.fillStyle = 'rgba(125, 211, 252, 0.28)'
      ctx.fillRect(roofX + roofW - 20, roofY + roofH - 18, 13, 9)
    }
  }

  // Windows: warm interior light versus dark glass, with frames and blinds.
  const litColor = seed % 3 === 0 ? '#fcd34d' : '#fde68a'
  for (let wy = building.y + 12; wy < building.y + building.h - 12; wy += 16) {
    for (let wx = building.x + 12; wx < building.x + building.w - 12; wx += 16) {
      const noise = (Math.round(wx) * 7 + Math.round(wy) * 13 + seed) % 11
      const lit = noise < 4
      ctx.fillStyle = 'rgba(10, 18, 28, 0.8)'
      ctx.fillRect(wx - 1, wy - 1, 8, 10)
      ctx.fillStyle = lit ? withAlpha(litColor, 0.85) : 'rgba(56, 84, 110, 0.6)'
      ctx.fillRect(wx, wy, 6, 8)
      if (!lit && noise === 7) {
        ctx.fillStyle = 'rgba(203, 213, 225, 0.18)'
        ctx.fillRect(wx, wy, 6, 3)
      }
    }
  }

  if (building.shop) {
    const stripeSeed = seed % 5
    const stripe = ['#f43f5e', '#38bdf8', '#a3e635', '#fbbf24', '#c084fc'][stripeSeed]
    ctx.fillStyle = stripe
    ctx.fillRect(building.x + 6, building.y + building.h - 10, building.w - 12, 4)
    ctx.fillStyle = 'rgba(253, 230, 138, 0.85)'
    for (let i = 0; i < 3; i += 1) {
      ctx.fillRect(building.x + 10 + i * 12, building.y + building.h - 17, 7, 3)
    }
    ctx.fillStyle = 'rgba(226, 232, 240, 0.16)'
    ctx.fillRect(building.x + 6, building.y + building.h - 15, building.w - 12, 3)
  }
}

function drawTree(ctx, tree) {
  ctx.fillStyle = 'rgba(0, 0, 0, 0.4)'
  ctx.beginPath()
  ctx.ellipse(tree.x + 5, tree.y + 6, tree.radius, tree.radius * 0.75, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#3b2b22'
  ctx.fillRect(tree.x - 2, tree.y - 2, 4, 6)
  const base = PALETTE.tree[tree.tone]
  const canopy = ctx.createRadialGradient(tree.x - tree.radius * 0.3, tree.y - tree.radius * 0.3, 1, tree.x, tree.y, tree.radius)
  canopy.addColorStop(0, shade(base, 0.28))
  canopy.addColorStop(1, shade(base, -0.32))
  ctx.fillStyle = canopy
  ctx.beginPath()
  ctx.arc(tree.x, tree.y, tree.radius, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.arc(tree.x - tree.radius * 0.5, tree.y + tree.radius * 0.25, tree.radius * 0.6, 0, Math.PI * 2)
  ctx.arc(tree.x + tree.radius * 0.45, tree.y + tree.radius * 0.2, tree.radius * 0.55, 0, Math.PI * 2)
  ctx.fill()
}

function drawParkedCar(ctx, car) {
  ctx.save()
  ctx.translate(car.x, car.y)
  ctx.rotate(car.angle)
  ctx.fillStyle = 'rgba(0, 0, 0, 0.45)'
  roundedRect(ctx, -18, -9, 38, 20, 6)
  ctx.fill()
  ctx.fillStyle = car.color
  roundedRect(ctx, -19, -9, 38, 18, 5)
  ctx.fill()
  ctx.fillStyle = 'rgba(10, 18, 28, 0.75)'
  roundedRect(ctx, -5, -7, 12, 14, 3)
  ctx.fill()
  ctx.fillStyle = 'rgba(253, 230, 138, 0.6)'
  ctx.fillRect(17, -6, 2, 3)
  ctx.fillRect(17, 3, 2, 3)
  ctx.restore()
}

function drawStreetlights(ctx, lights) {
  for (const light of lights) {
    const glow = ctx.createRadialGradient(light.x, light.y, 2, light.x, light.y, 88)
    glow.addColorStop(0, 'rgba(253, 230, 138, 0.26)')
    glow.addColorStop(0.4, 'rgba(253, 230, 138, 0.09)')
    glow.addColorStop(1, 'rgba(253, 230, 138, 0)')
    ctx.fillStyle = glow
    ctx.beginPath()
    ctx.arc(light.x, light.y, 88, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#0f172a'
    ctx.beginPath()
    ctx.arc(light.x, light.y, 3.2, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#fef3c7'
    ctx.beginPath()
    ctx.arc(light.x, light.y, 1.6, 0, Math.PI * 2)
    ctx.fill()
  }
}

// The city is static: build it once into an offscreen canvas and blit it every
// frame. This affords much more detail than redrawing every rectangle at 60 FPS.
export function createCityCanvas(world) {
  const canvas = document.createElement('canvas')
  canvas.width = world.width
  canvas.height = world.height
  const ctx = canvas.getContext('2d')
  const noise = noisePattern(world.seed + 7, '#e2e8f0', 6000)

  drawGround(ctx, world)
  drawBlockBases(ctx, world)
  drawRoadStrip(ctx, world, noise)
  drawIntersections(ctx, world, noise)
  for (const building of world.buildings) drawBuilding(ctx, building)
  for (const tree of world.trees) drawTree(ctx, tree)
  for (const car of world.parkedCars) drawParkedCar(ctx, car)
  drawStreetlights(ctx, world.streetlights)
  return canvas
}

function drawSkids(ctx, skids, bounds) {
  ctx.fillStyle = PALETTE.skid
  for (const mark of skids) {
    if (mark.x < bounds.left || mark.x > bounds.right || mark.y < bounds.top || mark.y > bounds.bottom) continue
    ctx.globalAlpha = Math.max(0, mark.life / mark.maxLife) * 0.85
    ctx.beginPath()
    ctx.ellipse(mark.x, mark.y, 7, 2.5, mark.angle, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.globalAlpha = 1
}

function drawParticles(ctx, particles, bounds) {
  for (const particle of particles) {
    if (particle.x < bounds.left || particle.x > bounds.right || particle.y < bounds.top || particle.y > bounds.bottom) continue
    ctx.globalAlpha = Math.max(0, particle.life / particle.maxLife) * 0.7
    ctx.fillStyle = particle.color
    ctx.beginPath()
    ctx.arc(particle.x, particle.y, particle.r, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.globalAlpha = 1
}

function drawWheel(ctx, x, y, steer = 0) {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(steer)
  ctx.fillStyle = '#080d14'
  roundedRect(ctx, -5, -3, 10, 6, 2)
  ctx.fill()
  ctx.fillStyle = '#64748b'
  ctx.fillRect(-2, -1.8, 3.5, 3.6)
  ctx.restore()
}

function carBodyPath(ctx) {
  ctx.beginPath()
  ctx.moveTo(-19, -11)
  ctx.quadraticCurveTo(-22, -11, -22, -7)
  ctx.lineTo(-22, 7)
  ctx.quadraticCurveTo(-22, 11, -19, 11)
  ctx.lineTo(10, 11)
  ctx.quadraticCurveTo(20, 11, 22, 6)
  ctx.quadraticCurveTo(23, 0, 22, -6)
  ctx.quadraticCurveTo(20, -11, 10, -11)
  ctx.closePath()
}

function drawHeadlights(ctx, car) {
  ctx.save()
  ctx.translate(car.x, car.y)
  ctx.rotate(car.angle)
  const beam = ctx.createLinearGradient(18, 0, 165, 0)
  beam.addColorStop(0, 'rgba(254, 243, 199, 0.3)')
  beam.addColorStop(1, 'rgba(254, 243, 199, 0)')
  ctx.fillStyle = beam
  ctx.beginPath()
  ctx.moveTo(18, -8)
  ctx.lineTo(165, -58)
  ctx.lineTo(165, 58)
  ctx.lineTo(18, 8)
  ctx.closePath()
  ctx.fill()
  ctx.restore()
}

function drawCar(ctx, car, isSelf = false) {
  drawHeadlights(ctx, car)

  ctx.save()
  ctx.translate(car.x, car.y)
  ctx.rotate(car.angle)
  ctx.fillStyle = 'rgba(0, 0, 0, 0.48)'
  ctx.beginPath()
  ctx.ellipse(-1, 3, 24, 13, 0, 0, Math.PI * 2)
  ctx.fill()

  if (car.isIt) {
    const aura = ctx.createRadialGradient(0, 0, 12, 0, 0, 40)
    aura.addColorStop(0, 'rgba(248, 113, 113, 0.38)')
    aura.addColorStop(1, 'rgba(248, 113, 113, 0)')
    ctx.fillStyle = aura
    ctx.beginPath()
    ctx.arc(0, 0, 40, 0, Math.PI * 2)
    ctx.fill()
  }

  const steer = (car.steer || 0) * 0.42
  drawWheel(ctx, 12, -11, steer)
  drawWheel(ctx, 12, 11, steer)
  drawWheel(ctx, -13, -11)
  drawWheel(ctx, -13, 11)

  ctx.translate(0, (car.roll || 0) * 1.6)

  const paint = ctx.createLinearGradient(0, -12, 0, 12)
  paint.addColorStop(0, shade(car.color, 0.3))
  paint.addColorStop(0.45, car.color)
  paint.addColorStop(1, shade(car.color, -0.38))
  carBodyPath(ctx)
  ctx.fillStyle = paint
  ctx.fill()
  ctx.strokeStyle = 'rgba(2, 6, 23, 0.65)'
  ctx.lineWidth = 1
  ctx.stroke()

  // Hood highlight and panel seams.
  ctx.fillStyle = 'rgba(255, 255, 255, 0.12)'
  ctx.beginPath()
  ctx.moveTo(9, -9)
  ctx.lineTo(19, -7)
  ctx.lineTo(19, 7)
  ctx.lineTo(9, 9)
  ctx.closePath()
  ctx.fill()
  ctx.strokeStyle = 'rgba(2, 6, 23, 0.45)'
  ctx.beginPath()
  ctx.moveTo(-9, -10)
  ctx.lineTo(-9, 10)
  ctx.moveTo(8, -10)
  ctx.lineTo(8, 10)
  ctx.stroke()

  // Cabin with windshield, rear glass and pillars.
  const glass = ctx.createLinearGradient(0, -8, 0, 8)
  glass.addColorStop(0, 'rgba(186, 230, 253, 0.72)')
  glass.addColorStop(0.5, 'rgba(30, 58, 92, 0.92)')
  glass.addColorStop(1, 'rgba(15, 23, 42, 0.95)')
  ctx.fillStyle = 'rgba(8, 15, 25, 0.9)'
  roundedRect(ctx, -7, -8.5, 15, 17, 3)
  ctx.fill()
  ctx.fillStyle = glass
  ctx.beginPath()
  ctx.moveTo(2, -7.5)
  ctx.lineTo(7, -5.5)
  ctx.lineTo(7, 5.5)
  ctx.lineTo(2, 7.5)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = 'rgba(71, 107, 140, 0.85)'
  ctx.fillRect(-6, -7, 4, 14)
  ctx.strokeStyle = 'rgba(2, 6, 23, 0.8)'
  ctx.beginPath()
  ctx.moveTo(-1.5, -8)
  ctx.lineTo(-1.5, 8)
  ctx.stroke()

  // Mirrors, handles, grille.
  ctx.fillStyle = shade(car.color, -0.15)
  ctx.fillRect(7, -14, 4, 3)
  ctx.fillRect(7, 11, 4, 3)
  ctx.fillStyle = 'rgba(226, 232, 240, 0.7)'
  ctx.fillRect(-4, -8, 3, 1.5)
  ctx.fillRect(-4, 6.5, 3, 1.5)
  ctx.fillStyle = 'rgba(10, 15, 23, 0.9)'
  ctx.fillRect(21, -5, 2, 10)

  // Headlights with a small local glow.
  for (const side of [-1, 1]) {
    const y = side * 6.5
    const glow = ctx.createRadialGradient(21, y, 0, 21, y, 8)
    glow.addColorStop(0, 'rgba(254, 243, 199, 0.85)')
    glow.addColorStop(1, 'rgba(254, 243, 199, 0)')
    ctx.fillStyle = glow
    ctx.beginPath()
    ctx.arc(21, y, 8, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#fef9c3'
    ctx.fillRect(19, y - 2, 3, 4)
  }

  // Taillights brighten while braking or reversing.
  const tailAlpha = car.braking ? 1 : 0.7
  ctx.fillStyle = `rgba(248, 113, 113, ${tailAlpha})`
  ctx.fillRect(-22, -9, 3, 4)
  ctx.fillRect(-22, 5, 3, 4)
  ctx.fillStyle = 'rgba(226, 232, 240, 0.75)'
  ctx.fillRect(-17, -3.5, 4, 7)

  if (isSelf) {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.65)'
    ctx.lineWidth = 1.5
    roundedRect(ctx, -24, -14, 48, 28, 9)
    ctx.stroke()
  }
  if (car.isIt) {
    ctx.strokeStyle = 'rgba(251, 146, 60, 0.95)'
    ctx.lineWidth = 2.5
    roundedRect(ctx, -27, -17, 54, 34, 11)
    ctx.stroke()
  }

  if (car.drifting) {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(-14, -11)
    ctx.lineTo(-10, 11)
    ctx.moveTo(-9, -11)
    ctx.lineTo(-5, 11)
    ctx.stroke()
  }
  ctx.restore()

  if (car.flash > 0) {
    ctx.save()
    ctx.globalAlpha = car.flash * 0.85
    ctx.strokeStyle = car.flashColor || '#22d3ee'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.arc(car.x, car.y, 26 + (1 - car.flash) * 34, 0, Math.PI * 2)
    ctx.stroke()
    ctx.restore()
  }

  const label = `${car.isIt ? '★ ' : ''}${car.name}${isSelf ? ' (you)' : ''}`
  ctx.font = '600 12px ui-monospace, monospace'
  ctx.textAlign = 'center'
  const width = ctx.measureText(label).width + 18
  ctx.fillStyle = 'rgba(2, 6, 23, 0.78)'
  roundedRect(ctx, car.x - width / 2, car.y - 36, width, 19, 6)
  ctx.fill()
  ctx.fillStyle = car.isIt ? '#fca5a5' : isSelf ? '#ffffff' : car.color
  ctx.beginPath()
  ctx.arc(car.x - width / 2 + 9, car.y - 26.5, 2.5, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillText(label, car.x + 3, car.y - 23)
}

// The caller has already applied DPR scaling and ctx.translate(-camera.x, -camera.y).
export function renderScene(ctx, { cityCanvas, world, camera, viewWidth, viewHeight, local, remotes, skids, particles }) {
  const bounds = {
    left: camera.x - 40,
    top: camera.y - 40,
    right: camera.x + viewWidth + 40,
    bottom: camera.y + viewHeight + 40,
  }

  if (cityCanvas) {
    ctx.drawImage(cityCanvas, 0, 0)
  } else {
    ctx.fillStyle = PALETTE.ground
    ctx.fillRect(bounds.left, bounds.top, bounds.right - bounds.left, bounds.bottom - bounds.top)
  }

  drawSkids(ctx, skids, bounds)
  drawParticles(ctx, particles, bounds)

  for (const remote of remotes) {
    if (remote.x < bounds.left - 30 || remote.x > bounds.right + 30 || remote.y < bounds.top - 40 || remote.y > bounds.bottom + 40) continue
    drawCar(ctx, remote, false)
  }
  if (local) drawCar(ctx, local, true)
}
