import { WORLD } from './constants.js'

// Deterministic PRNG: every client builds the identical city from one seed.
function mulberry32(seed) {
  let value = seed >>> 0
  return () => {
    value = (value + 0x6d2b79f5) >>> 0
    let t = value
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Landmarks sit in fixed blocks so they are guaranteed to exist in the same
// place on every client. Fractions keep them spread out if the grid ever grows.
function landmarkAt(column, row, columns, rows) {
  if (column === Math.floor(columns * 0.2) && row === Math.floor(rows * 0.25)) return 'hospital'
  if (column === Math.floor(columns * 0.7) && row === Math.floor(rows * 0.25)) return 'store'
  if (column === Math.floor(columns * 0.4) && row === Math.floor(rows * 0.625)) return 'playground'
  if (column === Math.floor(columns * 0.8) && row === Math.floor(rows * 0.75)) return 'playground'
  return null
}

export function createWorld(seed = 20261127) {
  const random = mulberry32(seed)
  const halfRoad = WORLD.roadWidth / 2
  const blocks = []
  const buildings = []
  const trees = []
  const parkedCars = []
  const playgrounds = []
  const streetlights = []
  const columns = Math.round(WORLD.width / WORLD.grid)
  const rows = Math.round(WORLD.height / WORLD.grid)

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const x = column * WORLD.grid + halfRoad + WORLD.sidewalk
      const y = row * WORLD.grid + halfRoad + WORLD.sidewalk
      const size = WORLD.grid - WORLD.roadWidth - WORLD.sidewalk * 2
      const roll = random()
      const type = landmarkAt(column, row, columns, rows)
        ?? (roll < 0.13 ? 'park' : roll < 0.25 ? 'lot' : roll < 0.6 ? 'houses' : 'built')
      const block = {
        x,
        y,
        size,
        type,
        tone: Math.floor(random() * 3),
        seed: Math.floor(random() * 100000),
        pathX: x + size * (0.35 + random() * 0.3),
        pathY: y + size * (0.35 + random() * 0.3),
      }
      blocks.push(block)

      if (type === 'park') {
        const count = 5 + Math.floor(random() * 4)
        for (let i = 0; i < count; i += 1) {
          trees.push({
            x: x + 18 + random() * (size - 36),
            y: y + 18 + random() * (size - 36),
            radius: 11 + random() * 7,
            tone: Math.floor(random() * 3),
          })
        }
        continue
      }

      if (type === 'playground') {
        playgrounds.push({ x, y, size, seed: block.seed })
        continue
      }

      if (type === 'lot') {
        // A small strip mall on one edge, parking bays in front of it.
        buildings.push({
          x: x + 8,
          y: y + 8,
          w: size - 16,
          h: 42 + random() * 18,
          tone: Math.floor(random() * 4),
          seed: Math.floor(random() * 1000),
          kind: 'built',
          shop: true,
        })
        const stallWidth = 26
        for (let i = 0; i < 4; i += 1) {
          const carX = x + 20 + i * stallWidth
          if (random() > 0.45) {
            parkedCars.push({
              x: carX,
              y: y + size - 34 - random() * 12,
              angle: Math.PI,
              color: ['#475569', '#7f1d1d', '#1e3a5f', '#78350f', '#3f3f46'][Math.floor(random() * 5)],
            })
          }
        }
        continue
      }

      if (type === 'hospital') {
        buildings.push({
          x: x + 6,
          y: y + 6,
          w: size - 12,
          h: size - 12,
          tone: Math.floor(random() * 2),
          seed: Math.floor(random() * 1000),
          kind: 'hospital',
        })
        continue
      }

      if (type === 'store') {
        const storeHeight = Math.round(size * 0.56)
        buildings.push({
          x: x + 6,
          y: y + 6,
          w: size - 12,
          h: storeHeight,
          tone: Math.floor(random() * 4),
          seed: Math.floor(random() * 1000),
          kind: 'store',
        })
        for (let i = 0; i < 3; i += 1) {
          if (random() > 0.25) {
            parkedCars.push({
              x: x + 26 + i * 40,
              y: y + size - 20,
              angle: Math.PI,
              color: ['#475569', '#7f1d1d', '#1e3a5f', '#3f3f46'][Math.floor(random() * 4)],
            })
          }
        }
        continue
      }

      if (type === 'houses') {
        const gap = 10
        const lotSize = (size - gap) / 2
        for (let ly = 0; ly < 2; ly += 1) {
          for (let lx = 0; lx < 2; lx += 1) {
            const inset = 8 + random() * 8
            buildings.push({
              x: x + lx * (lotSize + gap) + inset,
              y: y + ly * (lotSize + gap) + inset,
              w: lotSize - inset * 2,
              h: lotSize - inset * 2,
              tone: Math.floor(random() * 5),
              seed: Math.floor(random() * 1000),
              kind: 'house',
            })
          }
        }
        for (const [treeX, treeY] of [[x + 14, y + 14], [x + size - 14, y + size - 14]]) {
          if (random() < 0.65) {
            trees.push({
              x: treeX,
              y: treeY,
              radius: 7 + random() * 4,
              tone: Math.floor(random() * 3),
            })
          }
        }
        continue
      }

      // 2x2 lots with occasional merges for more varied building footprints.
      const gap = 12
      const lotSize = (size - gap) / 2
      const mergeHorizontal = random() < 0.18
      const mergeVertical = !mergeHorizontal && random() < 0.12
      const used = new Set()

      for (let ly = 0; ly < 2; ly += 1) {
        for (let lx = 0; lx < 2; lx += 1) {
          const key = `${lx},${ly}`
          if (used.has(key)) continue
          let cells = [[lx, ly]]
          if (mergeHorizontal && ly === 0 && random() < 0.7) {
            cells = [[0, 0], [1, 0]]
          } else if (mergeVertical && lx === 0 && random() < 0.7) {
            cells = [[0, 0], [0, 1]]
          }
          for (const cell of cells) used.add(`${cell[0]},${cell[1]}`)
          if (random() < 0.1) continue // small plaza / courtyard

          const inset = 7 + random() * 11
          const minX = Math.min(...cells.map((cell) => cell[0]))
          const minY = Math.min(...cells.map((cell) => cell[1]))
          const widthCells = Math.max(...cells.map((cell) => cell[0])) - minX + 1
          const heightCells = Math.max(...cells.map((cell) => cell[1])) - minY + 1
          buildings.push({
            x: x + minX * (lotSize + gap) + inset,
            y: y + minY * (lotSize + gap) + inset,
            w: widthCells * lotSize + (widthCells - 1) * gap - inset * 2,
            h: heightCells * lotSize + (heightCells - 1) * gap - inset * 2,
            tone: Math.floor(random() * 4),
            seed: Math.floor(random() * 1000),
            floors: 1 + Math.floor(random() * 4),
            shop: random() < 0.25,
            kind: 'built',
          })
        }
      }
    }
  }

  // Streetlights on alternating corners keep the city readable at dusk.
  const lampOffset = halfRoad + WORLD.sidewalk + 10
  for (let row = 0; row <= rows; row += 1) {
    for (let column = 0; column <= columns; column += 1) {
      if ((row + column) % 2 !== 0) continue
      const cx = column * WORLD.grid
      const cy = row * WORLD.grid
      streetlights.push({ x: cx - lampOffset, y: cy - lampOffset })
      streetlights.push({ x: cx + lampOffset, y: cy + lampOffset })
    }
  }

  return {
    ...WORLD,
    seed,
    blocks,
    buildings,
    trees,
    parkedCars,
    playgrounds,
    streetlights,
    roadsX: Array.from({ length: columns + 1 }, (_, i) => i * WORLD.grid),
    roadsY: Array.from({ length: rows + 1 }, (_, i) => i * WORLD.grid),
  }
}

// One shared city instance; never regenerate it inside the render loop.
export const world = createWorld()

export function clampToWorld(x, y, radius = 0) {
  return {
    x: Math.min(Math.max(x, radius), world.width - radius),
    y: Math.min(Math.max(y, radius), world.height - radius),
  }
}

export function isOnRoad(x, y) {
  const nearestX = Math.round(x / WORLD.grid) * WORLD.grid
  const nearestY = Math.round(y / WORLD.grid) * WORLD.grid
  return Math.abs(x - nearestX) <= WORLD.roadWidth / 2 || Math.abs(y - nearestY) <= WORLD.roadWidth / 2
}

// Spawn points lie on the central east-west road so nobody starts in a wall.
export function getSpawnPoints(count = 16) {
  const centerX = world.width / 2
  const centerY = Math.round(world.height / (2 * WORLD.grid)) * WORLD.grid
  return Array.from({ length: count }, (_, i) => ({
    x: centerX + (i - (count - 1) / 2) * 72,
    y: centerY,
    angle: i % 2 === 0 ? 0 : Math.PI,
  }))
}
