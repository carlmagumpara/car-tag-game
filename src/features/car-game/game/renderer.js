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
  lawn: '#22402f',
  houseRoof: ['#b45309', '#7f1d1d', '#1e3a5f', '#4c1d95', '#166534'],
  playground: ['#9a3412', '#1d4ed8', '#b45309'],
  storeStripe: ['#ef4444', '#f97316', '#22c55e'],
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
    if (block.type === 'park' || block.type === 'playground') {
      ctx.fillStyle = block.type === 'park' ? PALETTE.park : PALETTE.lawn
      ctx.fillRect(block.x, block.y, block.size, block.size)
      ctx.fillStyle = noisePattern(block.seed, '#86efac', 2200)
      ctx.fillRect(block.x, block.y, block.size, block.size)
      if (block.type === 'park') {
        ctx.fillStyle = PALETTE.parkPath
        ctx.fillRect(block.pathX - 7, block.y, 14, block.size)
        ctx.fillRect(block.x, block.pathY - 7, block.size, 14)
      }
      continue
    }
    if (block.type === 'houses') {
      ctx.fillStyle = PALETTE.lawn
      ctx.fillRect(block.x, block.y, block.size, block.size)
      ctx.fillStyle = noisePattern(block.seed, '#a3e635', 1400)
      ctx.fillRect(block.x, block.y, block.size, block.size)
      continue
    }
    if (block.type === 'lot') {
      ctx.fillStyle = PALETTE.lot
      ctx.fillRect(block.x, block.y, block.size, block.size)
      ctx.fillStyle = asphaltNoise
      ctx.fillRect(block.x, block.y, block.size, block.size)
      ctx.strokeStyle = 'rgba(226, 232, 240, 0.35)'
      ctx.lineWidth = 1.5
      for (let i = 0; i < 5; i += 1) {
        const x = block.x + 16 + i * 30
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
  // Background traffic follows the same low wedge silhouette as the drivers.
  ctx.save()
  ctx.translate(car.x, car.y)
  ctx.rotate(car.angle)
  ctx.fillStyle = 'rgba(0, 0, 0, 0.45)'
  roundedRect(ctx, -18, -9, 38, 20, 6)
  ctx.fill()
  const paint = ctx.createLinearGradient(0, -9, 0, 9)
  paint.addColorStop(0, shade(car.color, 0.25))
  paint.addColorStop(1, shade(car.color, -0.3))
  ctx.fillStyle = paint
  ctx.beginPath()
  ctx.moveTo(-18, -8)
  ctx.lineTo(-18, 8)
  ctx.quadraticCurveTo(-10, 10, -2, 9)
  ctx.lineTo(14, 6)
  ctx.quadraticCurveTo(20, 2, 20, 0)
  ctx.quadraticCurveTo(20, -2, 14, -6)
  ctx.lineTo(-2, -9)
  ctx.quadraticCurveTo(-10, -10, -18, -8)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = 'rgba(10, 18, 28, 0.85)'
  roundedRect(ctx, -7, -6, 11, 12, 3)
  ctx.fill()
  ctx.fillStyle = '#0f172a'
  ctx.fillRect(-20, -9, 3, 18)
  ctx.fillStyle = '#e0f2fe'
  ctx.fillRect(17, -5, 2, 3)
  ctx.fillRect(17, 2, 2, 3)
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

// Houses replace office towers on residential blocks. The gable ridge and
// dormers are what make a rectangle read as a house from directly above.
function drawHouse(ctx, house) {
  const roof = PALETTE.houseRoof[house.tone % PALETTE.houseRoof.length]
  const cx = house.x + house.w / 2
  const cy = house.y + house.h / 2

  ctx.fillStyle = 'rgba(0, 0, 0, 0.45)'
  ctx.fillRect(house.x + 4, house.y + 5, house.w, house.h)

  const surface = ctx.createLinearGradient(house.x, house.y, house.x + house.w, house.y + house.h)
  surface.addColorStop(0, shade(roof, 0.26))
  surface.addColorStop(1, shade(roof, -0.3))
  roundedRect(ctx, house.x, house.y, house.w, house.h, 2)
  ctx.fillStyle = surface
  ctx.fill()
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)'
  ctx.lineWidth = 1
  ctx.stroke()

  ctx.strokeStyle = 'rgba(0, 0, 0, 0.4)'
  ctx.lineWidth = 2
  ctx.beginPath()
  if (house.w >= house.h) {
    ctx.moveTo(house.x + 3, cy)
    ctx.lineTo(house.x + house.w - 3, cy)
  } else {
    ctx.moveTo(cx, house.y + 3)
    ctx.lineTo(cx, house.y + house.h - 3)
  }
  ctx.stroke()

  ctx.fillStyle = 'rgba(226, 232, 240, 0.5)'
  if (house.w >= house.h) {
    ctx.fillRect(cx - 6, cy - 9, 12, 5)
    ctx.fillRect(cx - 6, cy + 4, 12, 5)
  } else {
    ctx.fillRect(cx - 9, cy - 6, 5, 12)
    ctx.fillRect(cx + 4, cy - 6, 5, 12)
  }
  ctx.fillStyle = '#57534e'
  ctx.fillRect(house.x + house.w * 0.2, house.y + house.h * 0.18, 7, 7)

  // Front step and a sliver of driveway on the yard-facing edge.
  ctx.fillStyle = 'rgba(15, 23, 42, 0.75)'
  ctx.fillRect(cx - 5, house.y + house.h - 4, 10, 4)
  ctx.fillStyle = 'rgba(148, 163, 184, 0.45)'
  ctx.fillRect(cx - 7, house.y + house.h, 14, 5)
}

function drawConvenienceStore(ctx, building) {
  const { x, y, w, h } = building
  ctx.fillStyle = 'rgba(0, 0, 0, 0.48)'
  ctx.fillRect(x + 6, y + 7, w, h)

  const wall = ctx.createLinearGradient(x, y, x + w, y + h)
  wall.addColorStop(0, '#e2e8f0')
  wall.addColorStop(1, '#94a3b8')
  roundedRect(ctx, x, y, w, h, 3)
  ctx.fillStyle = wall
  ctx.fill()
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)'
  ctx.lineWidth = 1
  ctx.stroke()

  // Rooftop unit and a bright storefront with sliding doors.
  ctx.fillStyle = '#64748b'
  ctx.fillRect(x + 8, y + 8, w - 16, 10)
  ctx.fillStyle = '#cbd5e1'
  ctx.fillRect(x + 10, y + 10, 12, 6)

  const glassY = y + h - 26
  ctx.fillStyle = 'rgba(15, 23, 42, 0.88)'
  ctx.fillRect(x + 6, glassY, w - 12, 22)
  ctx.fillStyle = 'rgba(125, 211, 252, 0.42)'
  ctx.fillRect(x + 8, glassY + 2, w - 16, 12)
  ctx.fillStyle = 'rgba(226, 232, 240, 0.4)'
  ctx.fillRect(x + w * 0.26, glassY + 2, 12, 18)
  ctx.fillRect(x + w * 0.66, glassY + 2, 12, 18)

  const signY = glassY - 14
  const stripeWidth = (w - 12) / PALETTE.storeStripe.length
  PALETTE.storeStripe.forEach((color, index) => {
    ctx.fillStyle = color
    ctx.fillRect(x + 6 + index * stripeWidth, signY, stripeWidth, 12)
  })

  const logoX = x + w / 2
  ctx.fillStyle = '#f8fafc'
  roundedRect(ctx, logoX - 20, signY - 7, 40, 25, 4)
  ctx.fill()
  ctx.textAlign = 'center'
  ctx.font = '900 19px ui-monospace, monospace'
  ctx.fillStyle = PALETTE.storeStripe[0]
  ctx.fillText('7', logoX - 9, signY + 12)
  ctx.fillStyle = PALETTE.storeStripe[1]
  ctx.fillText('11', logoX + 8, signY + 12)
}

function drawHospital(ctx, building) {
  drawBuilding(ctx, building)

  const cx = building.x + building.w / 2
  const cy = building.y + building.h / 2
  const radius = Math.min(building.w, building.h) * 0.26
  ctx.fillStyle = '#cbd5e1'
  ctx.beginPath()
  ctx.arc(cx, cy, radius + 5, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#1e293b'
  ctx.beginPath()
  ctx.arc(cx, cy, radius, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = 'rgba(248, 250, 252, 0.85)'
  ctx.lineWidth = 2
  ctx.stroke()
  ctx.fillStyle = '#f8fafc'
  ctx.font = '900 22px ui-monospace, monospace'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('H', cx, cy + 1)
  ctx.textBaseline = 'alphabetic'

  const crossX = building.x + 24
  const crossY = building.y + 22
  ctx.fillStyle = '#ef4444'
  ctx.fillRect(crossX - 4, crossY - 11, 8, 22)
  ctx.fillRect(crossX - 11, crossY - 4, 22, 8)

  // Ambulance bay and the ambulance waiting at its road-facing edge.
  const bayY = building.y + building.h - 7
  ctx.fillStyle = '#0f172a'
  ctx.fillRect(cx - 28, bayY, 56, 7)
  ctx.fillStyle = 'rgba(56, 189, 248, 0.55)'
  ctx.fillRect(cx - 26, bayY + 2, 52, 3)

  const ambulanceY = bayY + 2
  ctx.fillStyle = 'rgba(0, 0, 0, 0.4)'
  roundedRect(ctx, cx - 17, ambulanceY - 8, 36, 17, 4)
  ctx.fill()
  ctx.fillStyle = '#f8fafc'
  roundedRect(ctx, cx - 19, ambulanceY - 10, 38, 18, 4)
  ctx.fill()
  ctx.fillStyle = '#ef4444'
  ctx.fillRect(cx - 19, ambulanceY - 2, 38, 4)
  ctx.fillStyle = '#38bdf8'
  ctx.fillRect(cx + 7, ambulanceY - 8, 8, 6)
}

function drawPlayground(ctx, area) {
  const { x, y, size } = area
  const px = x + 10
  const py = y + 10
  const span = size - 20

  ctx.strokeStyle = 'rgba(148, 163, 184, 0.55)'
  ctx.lineWidth = 2
  ctx.strokeRect(px, py, span, span)

  ctx.fillStyle = PALETTE.playground[0]
  roundedRect(ctx, px + 4, py + 4, span - 8, span * 0.44, 12)
  ctx.fill()
  ctx.fillStyle = PALETTE.playground[1]
  roundedRect(ctx, px + 4, py + span * 0.5, span * 0.44, span * 0.44, 12)
  ctx.fill()
  ctx.fillStyle = PALETTE.playground[2]
  roundedRect(ctx, px + span * 0.52, py + span * 0.5, span * 0.44, span * 0.44, 12)
  ctx.fill()

  // Swings: an A-frame with two seats.
  const swingX = px + span * 0.24
  const swingY = py + span * 0.22
  ctx.strokeStyle = '#e2e8f0'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(swingX - 18, swingY + 14)
  ctx.lineTo(swingX, swingY - 14)
  ctx.lineTo(swingX + 18, swingY + 14)
  ctx.moveTo(swingX - 18, swingY + 14)
  ctx.lineTo(swingX + 18, swingY + 14)
  ctx.stroke()
  for (const offset of [-9, 9]) {
    ctx.strokeStyle = '#94a3b8'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(swingX + offset, swingY)
    ctx.lineTo(swingX + offset, swingY + 17)
    ctx.stroke()
    ctx.fillStyle = offset < 0 ? '#f43f5e' : '#facc15'
    ctx.fillRect(swingX + offset - 5, swingY + 17, 10, 3)
  }

  // Slide: platform, ladder and a bright chute.
  const slideX = px + span * 0.62
  const slideY = py + span * 0.14
  ctx.strokeStyle = '#38bdf8'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(slideX, slideY)
  ctx.lineTo(slideX + 26, slideY + 5)
  ctx.moveTo(slideX + 3, slideY + 2)
  ctx.lineTo(slideX + 3, slideY + 24)
  ctx.moveTo(slideX + 13, slideY + 2)
  ctx.lineTo(slideX + 13, slideY + 24)
  ctx.stroke()
  ctx.fillStyle = '#fbbf24'
  ctx.beginPath()
  ctx.moveTo(slideX + 26, slideY + 3)
  ctx.lineTo(slideX + 40, slideY + 32)
  ctx.lineTo(slideX + 30, slideY + 32)
  ctx.lineTo(slideX + 18, slideY + 7)
  ctx.closePath()
  ctx.fill()

  ctx.fillStyle = '#fde68a'
  roundedRect(ctx, px + span * 0.55, py + span * 0.58, span * 0.3, span * 0.28, 8)
  ctx.fill()
  ctx.fillStyle = '#a855f7'
  ctx.beginPath()
  ctx.arc(px + span * 0.24, py + span * 0.74, Math.max(10, span * 0.12), 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#a3e635'
  ctx.fillRect(px + span * 0.06, py + span * 0.58, 5, 22)
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
  for (const building of world.buildings) {
    if (building.kind === 'house') drawHouse(ctx, building)
    else if (building.kind === 'store') drawConvenienceStore(ctx, building)
    else if (building.kind === 'hospital') drawHospital(ctx, building)
    else drawBuilding(ctx, building)
  }
  for (const area of world.playgrounds || []) drawPlayground(ctx, area)
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
  ctx.fillStyle = '#070b12'
  roundedRect(ctx, -6, -3.5, 12, 7, 2)
  ctx.fill()
  ctx.fillStyle = '#334155'
  ctx.beginPath()
  ctx.ellipse(0, 0, 4, 2.8, 0, 0, Math.PI * 2)
  ctx.fill()
  // Cross-spokes and a bright caliper read as performance brakes from above.
  ctx.strokeStyle = 'rgba(226, 232, 240, 0.75)'
  ctx.lineWidth = 0.9
  ctx.beginPath()
  ctx.moveTo(-3, 0)
  ctx.lineTo(3, 0)
  ctx.moveTo(0, -2.4)
  ctx.lineTo(0, 2.4)
  ctx.stroke()
  ctx.fillStyle = '#f97316'
  ctx.fillRect(-3.4, -1, 1.3, 2)
  ctx.restore()
}

function carBodyPath(ctx) {
  // Wide haunches at the back, a long wedge hood and a pointed nose.
  ctx.beginPath()
  ctx.moveTo(-22, -10)
  ctx.lineTo(-22, 10)
  ctx.quadraticCurveTo(-18, 12, -8, 12)
  ctx.lineTo(2, 12)
  ctx.quadraticCurveTo(8, 11, 11, 9)
  ctx.lineTo(20, 6)
  ctx.quadraticCurveTo(24, 3, 24, 0)
  ctx.quadraticCurveTo(24, -3, 20, -6)
  ctx.lineTo(11, -9)
  ctx.quadraticCurveTo(8, -11, 2, -12)
  ctx.lineTo(-8, -12)
  ctx.quadraticCurveTo(-18, -12, -22, -10)
  ctx.closePath()
}

function drawHeadlights(ctx, car) {
  ctx.save()
  ctx.translate(car.x, car.y)
  ctx.rotate(car.angle)
  // Cool LED beams instead of the old warm halogens.
  const beam = ctx.createLinearGradient(22, 0, 170, 0)
  beam.addColorStop(0, 'rgba(224, 242, 254, 0.34)')
  beam.addColorStop(1, 'rgba(224, 242, 254, 0)')
  ctx.fillStyle = beam
  ctx.beginPath()
  ctx.moveTo(21, -7)
  ctx.lineTo(170, -52)
  ctx.lineTo(170, 52)
  ctx.lineTo(21, 7)
  ctx.closePath()
  ctx.fill()
  ctx.restore()
}

function drawCar(ctx, car, isSelf = false, now = 0) {
  drawHeadlights(ctx, car)

  ctx.save()
  ctx.translate(car.x, car.y)
  ctx.rotate(car.angle)
  ctx.fillStyle = 'rgba(0, 0, 0, 0.5)'
  ctx.beginPath()
  ctx.ellipse(-1, 3, 26, 14, 0, 0, Math.PI * 2)
  ctx.fill()

  if (car.isIt) {
    const aura = ctx.createRadialGradient(0, 0, 14, 0, 0, 46)
    aura.addColorStop(0, 'rgba(248, 113, 113, 0.38)')
    aura.addColorStop(1, 'rgba(248, 113, 113, 0)')
    ctx.fillStyle = aura
    ctx.beginPath()
    ctx.arc(0, 0, 46, 0, Math.PI * 2)
    ctx.fill()
  }

  // Temporary immunity: a dashed teal shield ring. The expiry is a local
  // performance.now() timestamp, so it fades at the same time on every client.
  if (car.immuneUntil > now) {
    ctx.save()
    ctx.globalAlpha = 0.14
    ctx.fillStyle = '#2dd4bf'
    ctx.beginPath()
    ctx.arc(0, 0, 34, 0, Math.PI * 2)
    ctx.fill()
    ctx.globalAlpha = 0.8
    ctx.strokeStyle = '#5eead4'
    ctx.lineWidth = 2
    ctx.setLineDash([5, 4])
    ctx.beginPath()
    ctx.arc(0, 0, 34, 0, Math.PI * 2)
    ctx.stroke()
    ctx.restore()
  }

  const steer = (car.steer || 0) * 0.42
  drawWheel(ctx, 13, -12.5, steer)
  drawWheel(ctx, 13, 12.5, steer)
  drawWheel(ctx, -14, -12.5)
  drawWheel(ctx, -14, 12.5)

  ctx.translate(0, (car.roll || 0) * 1.6)

  // Carbon splitter and diffuser peek out from under the low bodywork.
  ctx.fillStyle = '#0b1120'
  ctx.fillRect(20, -10, 5, 20)
  ctx.fillRect(-23, -9, 4, 18)

  const paint = ctx.createLinearGradient(0, -12, 0, 12)
  paint.addColorStop(0, shade(car.color, 0.38))
  paint.addColorStop(0.42, car.color)
  paint.addColorStop(1, shade(car.color, -0.45))
  carBodyPath(ctx)
  ctx.fillStyle = paint
  ctx.fill()
  ctx.strokeStyle = 'rgba(2, 6, 23, 0.7)'
  ctx.lineWidth = 1
  ctx.stroke()

  // Hood vents, power bulge and twin racing stripes.
  ctx.fillStyle = 'rgba(8, 15, 25, 0.55)'
  ctx.beginPath()
  ctx.moveTo(11, -8)
  ctx.lineTo(16, -6)
  ctx.lineTo(16, -4)
  ctx.lineTo(11, -5)
  ctx.closePath()
  ctx.fill()
  ctx.beginPath()
  ctx.moveTo(11, 8)
  ctx.lineTo(16, 6)
  ctx.lineTo(16, 4)
  ctx.lineTo(11, 5)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = 'rgba(255, 255, 255, 0.16)'
  ctx.fillRect(10, -2, 10, 1.5)
  ctx.fillRect(10, 0.5, 10, 1.5)

  // Side air intakes just behind the front wheels.
  ctx.fillStyle = 'rgba(8, 15, 25, 0.65)'
  ctx.beginPath()
  ctx.moveTo(-2, -12)
  ctx.lineTo(4, -11)
  ctx.lineTo(3, -9)
  ctx.lineTo(-2, -10)
  ctx.closePath()
  ctx.fill()
  ctx.beginPath()
  ctx.moveTo(-2, 12)
  ctx.lineTo(4, 11)
  ctx.lineTo(3, 9)
  ctx.lineTo(-2, 10)
  ctx.closePath()
  ctx.fill()

  // Panoramic glass canopy with a carbon spine and a lit windshield.
  const glass = ctx.createLinearGradient(0, -9, 0, 9)
  glass.addColorStop(0, 'rgba(186, 230, 253, 0.82)')
  glass.addColorStop(0.45, 'rgba(30, 58, 92, 0.94)')
  glass.addColorStop(1, 'rgba(15, 23, 42, 0.96)')
  ctx.beginPath()
  ctx.moveTo(-9, -7)
  ctx.quadraticCurveTo(-6, -9.5, 0, -9)
  ctx.lineTo(8, -6)
  ctx.quadraticCurveTo(10, 0, 8, 6)
  ctx.lineTo(0, 9)
  ctx.quadraticCurveTo(-6, 9.5, -9, 7)
  ctx.quadraticCurveTo(-11, 0, -9, -7)
  ctx.closePath()
  ctx.fillStyle = glass
  ctx.fill()
  ctx.strokeStyle = 'rgba(2, 6, 23, 0.85)'
  ctx.lineWidth = 1.4
  ctx.stroke()
  ctx.fillStyle = 'rgba(125, 211, 252, 0.35)'
  ctx.beginPath()
  ctx.moveTo(4, -6)
  ctx.lineTo(8, -5)
  ctx.lineTo(8, 5)
  ctx.lineTo(4, 6)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = shade(car.color, -0.25)
  ctx.fillRect(-1.6, -8.5, 3.2, 17)
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.4)'
  ctx.lineWidth = 0.8
  ctx.beginPath()
  ctx.moveTo(-8, 0)
  ctx.lineTo(-3, 0)
  ctx.stroke()

  // Mirrors on short stalks.
  ctx.fillStyle = shade(car.color, -0.1)
  roundedRect(ctx, 2, -14, 5, 3, 1)
  ctx.fill()
  roundedRect(ctx, 2, 11, 5, 3, 1)
  ctx.fill()

  // Rear wing: a wide carbon blade with endplates and pylons.
  ctx.fillStyle = 'rgba(0, 0, 0, 0.45)'
  ctx.fillRect(-25, -14, 6, 30)
  ctx.fillStyle = '#0f172a'
  ctx.fillRect(-25, -14, 5, 28)
  ctx.fillStyle = 'rgba(148, 163, 184, 0.55)'
  ctx.fillRect(-24.5, -13.5, 4, 27)
  ctx.fillStyle = '#020617'
  ctx.fillRect(-25, -15.5, 6, 2.5)
  ctx.fillRect(-25, 13, 6, 2.5)
  ctx.fillStyle = '#334155'
  ctx.fillRect(-21, -8, 2, 4)
  ctx.fillRect(-21, 4, 2, 4)

  // Thin LED headlights with a local cool glow.
  for (const side of [-1, 1]) {
    const y = side * 6.5
    const glow = ctx.createRadialGradient(21, y, 0, 21, y, 10)
    glow.addColorStop(0, 'rgba(224, 242, 254, 0.9)')
    glow.addColorStop(1, 'rgba(224, 242, 254, 0)')
    ctx.fillStyle = glow
    ctx.beginPath()
    ctx.arc(21, y, 10, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#e0f2fe'
    ctx.beginPath()
    ctx.moveTo(18, y - 2)
    ctx.lineTo(23, y - 1)
    ctx.lineTo(23, y + 1)
    ctx.lineTo(18, y + 2)
    ctx.closePath()
    ctx.fill()
  }

  // Full-width LED tail bar brightens while braking or reversing.
  const tailAlpha = car.braking ? 1 : 0.72
  ctx.fillStyle = `rgba(248, 113, 113, ${tailAlpha})`
  ctx.fillRect(-20, -10, 3.5, 6)
  ctx.fillRect(-20, 4, 3.5, 6)
  ctx.fillStyle = `rgba(248, 113, 113, ${tailAlpha * 0.5})`
  ctx.fillRect(-20, -3, 3.5, 6)

  if (isSelf) {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)'
    ctx.lineWidth = 1.5
    roundedRect(ctx, -27, -17, 53, 34, 10)
    ctx.stroke()
  }
  if (car.isIt) {
    ctx.strokeStyle = 'rgba(251, 146, 60, 0.95)'
    ctx.lineWidth = 2.5
    roundedRect(ctx, -30, -20, 58, 40, 12)
    ctx.stroke()
  }

  if (car.drifting) {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(-16, -12)
    ctx.lineTo(-12, 12)
    ctx.moveTo(-11, -12)
    ctx.lineTo(-7, 12)
    ctx.stroke()
  }
  ctx.restore()

  if (car.flash > 0) {
    ctx.save()
    ctx.globalAlpha = car.flash * 0.85
    ctx.strokeStyle = car.flashColor || '#22d3ee'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.arc(car.x, car.y, 30 + (1 - car.flash) * 34, 0, Math.PI * 2)
    ctx.stroke()
    ctx.restore()
  }

  // Prominent arcade badge above the tagger, independent of the car's rotation.
  if (car.isIt) {
    ctx.save()
    ctx.fillStyle = '#fb923c'
    roundedRect(ctx, car.x - 13, car.y - 57, 26, 16, 5)
    ctx.fill()
    ctx.fillStyle = '#0b1120'
    ctx.font = '700 10px ui-monospace, monospace'
    ctx.textAlign = 'center'
    ctx.fillText('IT', car.x, car.y - 45)
    ctx.restore()
  }

  const shieldSeconds = car.immuneUntil > now ? Math.ceil((car.immuneUntil - now) / 1000) : 0
  const label = `${car.isIt ? '★ ' : ''}${car.name}${shieldSeconds > 0 ? ` · SHIELD ${shieldSeconds}s` : ''}${isSelf ? ' (you)' : ''}`
  ctx.font = '600 12px ui-monospace, monospace'
  ctx.textAlign = 'center'
  const width = ctx.measureText(label).width + 18
  ctx.fillStyle = 'rgba(2, 6, 23, 0.78)'
  roundedRect(ctx, car.x - width / 2, car.y - 36, width, 19, 6)
  ctx.fill()
  ctx.fillStyle = car.isIt ? '#fca5a5' : shieldSeconds > 0 ? '#5eead4' : isSelf ? '#ffffff' : car.color
  ctx.beginPath()
  ctx.arc(car.x - width / 2 + 9, car.y - 26.5, 2.5, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillText(label, car.x + 3, car.y - 23)
}

// The caller has already applied DPR scaling and ctx.translate(-camera.x, -camera.y).
export function renderScene(ctx, { cityCanvas, world, camera, viewWidth, viewHeight, local, remotes, skids, particles, now = 0 }) {
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
    drawCar(ctx, remote, false, now)
  }
  if (local) drawCar(ctx, local, true, now)
}
