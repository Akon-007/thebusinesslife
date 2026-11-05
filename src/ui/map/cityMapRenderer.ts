import { BUILDINGS, DISTRICTS } from '../../data/buildings'
import { MAP_WATER_COLOR, PROMENADES, ROADS, ROAD_COLOR, WATER } from '../../data/cityMap'
import { ROLE_BY_ID } from '../../data/npcCatalog'
import { npcRuntime } from '../../game/npcRuntime'
import { playerState } from '../../game/player/playerState'
import { useGameStore } from '../../state/gameStore'
import { missionForLevel } from '../../systems/progression/progressionEngine'

/**
 * The city blueprint, drawn.
 *
 * Every map in the game — the corner minimap and the full map screen — is this
 * one function. It reads exactly the same layout the 3D world is built from
 * (`data/cityMap.ts`, `data/buildings.ts`), so the plan on screen and the city
 * underfoot can never disagree.
 */

/** The slice of the world the maps frame: the city, plus the lagoon and creek. */
export const MAP_EXTENT = { minX: -212, maxX: 246, minZ: -178, maxZ: 294 }

/** The colour of the ground plane under the 3D city, so the plan matches it. */
const GROUND = '#7f7869'
const HUB = '#8e8a7d'
const GOLD = '#ffd166'

export interface MapFrame {
  width: number
  height: number
  padding: number
}

export interface Projection {
  scale: number
  toX: (x: number) => number
  toY: (z: number) => number
  toWorld: (px: number, py: number) => { x: number; z: number }
  drawnWidth: number
  drawnHeight: number
  originX: number
  originY: number
}

/** Fits the world into a rectangle, preserving aspect ratio (letterboxed). */
export function makeProjection({ width, height, padding }: MapFrame): Projection {
  const spanX = MAP_EXTENT.maxX - MAP_EXTENT.minX
  const spanZ = MAP_EXTENT.maxZ - MAP_EXTENT.minZ
  const scale = Math.min((width - padding * 2) / spanX, (height - padding * 2) / spanZ)
  const drawnWidth = spanX * scale
  const drawnHeight = spanZ * scale
  const originX = (width - drawnWidth) / 2
  const originY = (height - drawnHeight) / 2
  const toX = (x: number) => originX + (x - MAP_EXTENT.minX) * scale
  const toY = (z: number) => originY + (z - MAP_EXTENT.minZ) * scale
  return {
    scale,
    toX,
    toY,
    toWorld: (px, py) => ({
      x: (px - originX) / scale + MAP_EXTENT.minX,
      z: (py - originY) / scale + MAP_EXTENT.minZ,
    }),
    drawnWidth,
    drawnHeight,
    originX,
    originY,
  }
}

export interface DrawOptions {
  /** The full map labels everything; the minimap stays quiet. */
  detail: boolean
  /** Callback so a host can highlight whatever the pointer is over. */
  highlightDistrictId?: string | null
}

/* --------------------------------------------------------------- theming -- */

/** The chrome colours the plan borrows from whichever theme is live. */
interface MapPalette {
  backdrop: string
  frame: string
  label: string
  labelBg: string
  ink: string
  muted: string
  onAccent: string
}

const FALLBACK_PALETTE: MapPalette = {
  backdrop: '#0b1220',
  frame: 'rgba(255, 255, 255, 0.22)',
  label: '#dbe6f5',
  labelBg: 'rgba(6, 12, 24, 0.72)',
  ink: '#e9eff8',
  muted: '#9db0c6',
  onAccent: '#0b1220',
}

let paletteTheme = ''
let cachedPalette = FALLBACK_PALETTE

/**
 * Reads the map's chrome colours from the same custom properties the rest of
 * the interface is painted with, so a theme switch repaints the plan too
 * without a second palette being maintained in here.
 *
 * Only the chrome is themed. The ground, the water and the buildings are
 * colours of the *world*: they are the same in the 3D scene whichever theme is
 * selected, so the plan keeps telling the truth about the city.
 *
 * Cached per theme — the map redraws several times a second and a style read
 * on every frame would be wasted work.
 */
function palette(): MapPalette {
  const theme = document.documentElement.dataset.theme ?? 'dark'
  if (theme === paletteTheme) return cachedPalette

  const styles = getComputedStyle(document.documentElement)
  const token = (name: string, fallback: string) =>
    styles.getPropertyValue(name).trim() || fallback

  cachedPalette = {
    backdrop: token('--map-backdrop', FALLBACK_PALETTE.backdrop),
    frame: token('--map-frame', FALLBACK_PALETTE.frame),
    label: token('--map-label', FALLBACK_PALETTE.label),
    labelBg: token('--map-label-bg', FALLBACK_PALETTE.labelBg),
    ink: token('--map-ink', FALLBACK_PALETTE.ink),
    muted: token('--map-muted', FALLBACK_PALETTE.muted),
    onAccent: token('--on-accent', FALLBACK_PALETTE.onAccent),
  }
  paletteTheme = theme
  return cachedPalette
}

/* ------------------------------------------------------------------ pins -- */

const PIN_FONT = '700 11px "Segoe UI", system-ui, sans-serif'
const PIN_HEIGHT = 22
const PIN_CHIP = 11

/** A district pin before it has been placed. */
interface PinCandidate {
  id: string
  label: string
  color: string
  /** The point on the plan the pin names. */
  anchorX: number
  anchorY: number
  /** Unfinished mission objectives waiting in this district. */
  badge: number
}

/** A district pin with its pill laid out. */
interface MapPin extends PinCandidate {
  x: number
  y: number
  width: number
}

/**
 * Places the pin pills so no two overlap.
 *
 * Each pill wants to sit just above the district it names, clamped to the
 * frame. Where two would collide — and a 3x2 grid of districts in a wide, short
 * frame means they usually do — the pill is nudged a row at a time, first up
 * then down, until it finds a free slot. The leader line is drawn afterwards,
 * so a pin that has travelled to avoid a neighbour still points home.
 */
function layoutPins(
  ctx: CanvasRenderingContext2D,
  frame: MapFrame,
  candidates: PinCandidate[],
): MapPin[] {
  const narrow = frame.width < 640
  const edge = narrow ? 46 : 84
  const minGapX = narrow ? 96 : 150
  const stepY = narrow ? 40 : 30
  const minY = 34
  const maxY = Math.max(minY, frame.height - 24)

  ctx.font = PIN_FONT

  const placed: MapPin[] = []
  for (const candidate of candidates) {
    const width = ctx.measureText(candidate.label).width + (candidate.badge > 0 ? 32 : 20)
    const x = Math.min(Math.max(candidate.anchorX, edge), Math.max(edge, frame.width - edge))
    const startY = Math.min(Math.max(candidate.anchorY - 26, minY), maxY)

    const free = (y: number) =>
      !placed.some((p) => Math.abs(p.x - x) < minGapX && Math.abs(p.y - y) < stepY)

    let y = startY
    for (let step = 1; !free(y) && step <= 8; step++) {
      const up = Math.min(Math.max(startY - step * stepY, minY), maxY)
      if (free(up)) {
        y = up
        break
      }
      const down = Math.min(Math.max(startY + step * stepY, minY), maxY)
      if (free(down)) {
        y = down
        break
      }
    }

    placed.push({ ...candidate, x, y, width })
  }
  return placed
}

/**
 * Draws the placed pins: a leader line home, the anchor dot on the district,
 * then the colour-coded pill. The anchor dot is deliberately drawn *first* so
 * the pill always sits on top of the line that reaches it.
 */
function drawPins(
  ctx: CanvasRenderingContext2D,
  pins: MapPin[],
  pal: MapPalette,
  highlightId: string | null,
): void {
  for (const pin of pins) {
    const active = pin.id === highlightId
    const left = pin.x - pin.width / 2
    const top = pin.y - PIN_HEIGHT / 2
    const bottom = top + PIN_HEIGHT

    ctx.lineWidth = active ? 1.8 : 1.2
    ctx.strokeStyle = active ? pin.color : pal.frame
    ctx.beginPath()
    ctx.moveTo(pin.x, bottom)
    ctx.lineTo(pin.anchorX, pin.anchorY)
    ctx.stroke()

    ctx.beginPath()
    ctx.arc(pin.anchorX, pin.anchorY, active ? 6 : 4.5, 0, Math.PI * 2)
    ctx.fillStyle = pin.color
    ctx.fill()
    ctx.strokeStyle = pal.backdrop
    ctx.lineWidth = 1.5
    ctx.stroke()

    ctx.fillStyle = pal.labelBg
    roundRect(ctx, left, top, pin.width, PIN_HEIGHT, 7)
    ctx.fill()
    ctx.strokeStyle = active ? pin.color : pal.frame
    ctx.lineWidth = active ? 1.6 : 1
    ctx.stroke()

    ctx.fillStyle = pin.color
    roundRect(ctx, left + 5, pin.y - PIN_CHIP / 2, PIN_CHIP, PIN_CHIP, 3)
    ctx.fill()

    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.font = PIN_FONT
    ctx.fillStyle = active ? pin.color : pal.label
    ctx.fillText(pin.label, left + 5 + PIN_CHIP + 6, pin.y + 0.5)

    if (pin.badge > 0) {
      const bx = left + pin.width - 11
      ctx.beginPath()
      ctx.arc(bx, pin.y, 7, 0, Math.PI * 2)
      ctx.fillStyle = GOLD
      ctx.fill()
      ctx.textAlign = 'center'
      ctx.font = '800 9px "Segoe UI", system-ui, sans-serif'
      ctx.fillStyle = pal.onAccent
      ctx.fillText(String(pin.badge), bx, pin.y + 0.5)
    }
  }
}

/** A rounded rectangle that works on every canvas implementation. */
function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const radius = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2)
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.arcTo(x + w, y, x + w, y + h, radius)
  ctx.arcTo(x + w, y + h, x, y + h, radius)
  ctx.arcTo(x, y + h, x, y, radius)
  ctx.arcTo(x, y, x + w, y, radius)
  ctx.closePath()
}

export function drawCityMap(
  ctx: CanvasRenderingContext2D,
  frame: MapFrame,
  opts: DrawOptions,
): void {
  const p = makeProjection(frame)
  const { toX, toY, scale } = p
  const pal = palette()

  /** Fill a world-space rectangle. */
  const fillRect = (
    x: number,
    z: number,
    w: number,
    d: number,
    color: string,
    alpha = 1,
  ) => {
    ctx.globalAlpha = alpha
    ctx.fillStyle = color
    ctx.fillRect(toX(x - w / 2), toY(z - d / 2), w * scale, d * scale)
    ctx.globalAlpha = 1
  }

  ctx.clearRect(0, 0, frame.width, frame.height)

  // ---- backdrop -------------------------------------------------------
  ctx.fillStyle = pal.backdrop
  ctx.fillRect(0, 0, frame.width, frame.height)

  // Everything from here is world-space and confined to the framed extent:
  // the lagoon runs wider than the frame and must not spill into the margins.
  ctx.save()
  ctx.beginPath()
  ctx.rect(p.originX, p.originY, p.drawnWidth, p.drawnHeight)
  ctx.clip()

  // ---- ground ---------------------------------------------------------
  // The 3D city sits on a ground plane that covers everything, with the lagoon
  // and creek laid over it as water. The plan does the same — ground fills the
  // whole extent, water goes on top — instead of the fixed patch that used to
  // stop short of the frame.
  ctx.fillStyle = GROUND
  ctx.fillRect(p.originX, p.originY, p.drawnWidth, p.drawnHeight)

  // ---- lagoon and creek ----------------------------------------------
  for (const w of WATER) {
    fillRect(w.x, w.z, w.width, w.depth, MAP_WATER_COLOR)
    // a few ripples so the water reads as water
    ctx.strokeStyle = 'rgba(140, 200, 230, 0.16)'
    ctx.lineWidth = 1
    const lines = 5
    const from = w.z - w.depth / 2
    const step = w.depth / (lines + 1)
    for (let i = 1; i <= lines; i++) {
      const z = from + step * i
      ctx.beginPath()
      ctx.moveTo(toX(w.x - w.width / 2 + 8), toY(z))
      ctx.lineTo(toX(w.x + w.width / 2 - 8), toY(z))
      ctx.stroke()
    }
  }

  // ---- district ground ------------------------------------------------
  for (const d of DISTRICTS) {
    const w = d.size[0] * 2
    const h = d.size[1] * 2
    fillRect(d.center[0], d.center[1], w, h, d.groundColor, opts.detail ? 0.55 : 0.45)
  }

  // ---- promenade ------------------------------------------------------
  for (const pm of PROMENADES) {
    fillRect(pm.x, pm.z, pm.length, pm.width, '#c3bcab', 0.95)
  }

  // ---- roads ----------------------------------------------------------
  for (const road of ROADS) {
    const alongZ = Math.abs(road.rotation) > Math.PI / 4
    const w = alongZ ? road.width : road.length
    const d = alongZ ? road.length : road.width
    fillRect(road.x, road.z, w, d, ROAD_COLOR[road.kind])
  }
  // centre lines down the avenues, for a map-like finish
  ctx.strokeStyle = 'rgba(255, 209, 102, 0.35)'
  ctx.lineWidth = Math.max(1, scale * 1.2)
  ctx.setLineDash([scale * 6, scale * 6])
  for (const road of ROADS) {
    if (road.kind === 'street') continue
    const alongZ = Math.abs(road.rotation) > Math.PI / 4
    ctx.beginPath()
    if (alongZ) {
      ctx.moveTo(toX(road.x), toY(road.z - road.length / 2))
      ctx.lineTo(toX(road.x), toY(road.z + road.length / 2))
    } else {
      ctx.moveTo(toX(road.x - road.length / 2), toY(road.z))
      ctx.lineTo(toX(road.x + road.length / 2), toY(road.z))
    }
    ctx.stroke()
  }
  ctx.setLineDash([])

  // ---- district hubs --------------------------------------------------
  for (const d of DISTRICTS) {
    ctx.fillStyle = HUB
    ctx.beginPath()
    ctx.arc(toX(d.center[0]), toY(d.center[1]), Math.max(3, 9 * scale), 0, Math.PI * 2)
    ctx.fill()
  }

  // ---- buildings ------------------------------------------------------
  for (const b of BUILDINGS) {
    const w = b.size[0] * scale
    const d = b.size[2] * scale
    const x = toX(b.position[0])
    const y = toY(b.position[2])
    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(-b.rotationY)
    ctx.fillStyle = b.color
    ctx.fillRect(-w / 2, -d / 2, w, d)
    ctx.fillStyle = b.roofColor
    ctx.globalAlpha = 0.5
    ctx.fillRect(-w / 2, -d / 2, w, Math.max(1.5, d * 0.28))
    ctx.globalAlpha = 1
    ctx.strokeStyle = 'rgba(6, 12, 24, 0.55)'
    ctx.lineWidth = 1
    ctx.strokeRect(-w / 2, -d / 2, w, d)
    ctx.restore()
  }

  // ---- mission guidance ----------------------------------------------
  const game = useGameStore.getState()
  const mission = missionForLevel(game.levelIndex)
  const pulse = 0.55 + Math.sin(performance.now() / 320) * 0.35
  /** Unfinished objectives per district *name*, for the pin badges. */
  const errandsByDistrict = new Map<string, number>()
  if (mission) {
    for (const o of mission.objectives) {
      const done = game.progress.find((x) => x.objectiveId === o.id)?.done
      if (done) continue
      if (o.hintLocation) {
        errandsByDistrict.set(o.hintLocation, (errandsByDistrict.get(o.hintLocation) ?? 0) + 1)
      }

      if (o.type === 'visit_building') {
        ctx.strokeStyle = `rgba(255, 209, 102, ${pulse})`
        ctx.lineWidth = 2
        for (const b of BUILDINGS) {
          if (b.type !== o.target) continue
          const w = b.size[0] * scale + 6
          const d = b.size[2] * scale + 6
          ctx.strokeRect(toX(b.position[0]) - w / 2, toY(b.position[2]) - d / 2, w, d)
        }
      }

      if (o.hintLocation) {
        const district = DISTRICTS.find((d) => d.name === o.hintLocation)
        if (!district) continue
        ctx.strokeStyle = `rgba(255, 209, 102, ${pulse})`
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.arc(toX(district.center[0]), toY(district.center[1]), Math.max(10, 20 * scale), 0, Math.PI * 2)
        ctx.stroke()
      }
    }
  }

  // ---- the crowd ------------------------------------------------------
  const dot = opts.detail ? 2.6 : 1.4
  for (const npc of npcRuntime.npcs) {
    if (npc.state === 'inside') continue
    ctx.fillStyle = ROLE_BY_ID[npc.role]?.accent ?? '#9db0c6'
    ctx.beginPath()
    ctx.arc(toX(npc.position[0]), toY(npc.position[2]), dot, 0, Math.PI * 2)
    ctx.fill()
  }

  // ---- the player, with a heading line --------------------------------
  const px = toX(playerState.x)
  const pz = toY(playerState.z)
  const dirX = Math.sin(playerState.rotationY)
  const dirZ = Math.cos(playerState.rotationY)
  ctx.strokeStyle = GOLD
  ctx.lineWidth = opts.detail ? 3 : 2
  ctx.beginPath()
  ctx.moveTo(px, pz)
  ctx.lineTo(px + dirX * (opts.detail ? 22 : 10), pz + dirZ * (opts.detail ? 22 : 10))
  ctx.stroke()
  ctx.fillStyle = GOLD
  ctx.beginPath()
  ctx.arc(px, pz, opts.detail ? 5.5 : 3.4, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = '#0b1220'
  ctx.lineWidth = 1.5
  ctx.stroke()

  // Release the world-space clip and trace the edge of the framed extent.
  ctx.restore()
  ctx.strokeStyle = pal.frame
  ctx.lineWidth = 2
  ctx.strokeRect(p.originX, p.originY, p.drawnWidth, p.drawnHeight)

  // ---- compass + scale (full map only) --------------------------------
  if (opts.detail) {
    // Anchored to the frame it sits on, not to hard-coded world coordinates.
    const cx = p.originX + p.drawnWidth / 2
    const top = p.originY
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = pal.muted
    ctx.font = '700 12px "Segoe UI", system-ui, sans-serif'
    ctx.fillText('N', cx, top + 12)
    ctx.beginPath()
    ctx.moveTo(cx, top + 2)
    ctx.lineTo(cx - 5, top + 20)
    ctx.lineTo(cx, top + 16)
    ctx.lineTo(cx + 5, top + 20)
    ctx.closePath()
    ctx.fillStyle = pal.ink
    ctx.fill()

    // a 50 metre scale bar
    const barMetres = 50
    const barPx = barMetres * scale
    const bx = p.originX + 4
    const by = p.originY + p.drawnHeight - 10
    ctx.strokeStyle = pal.ink
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(bx, by - 5)
    ctx.lineTo(bx, by)
    ctx.lineTo(bx + barPx, by)
    ctx.lineTo(bx + barPx, by - 5)
    ctx.stroke()
    ctx.textAlign = 'left'
    ctx.fillStyle = pal.ink
    ctx.font = '600 10px "Segoe UI", system-ui, sans-serif'
    ctx.fillText(`${barMetres} m`, bx, by - 12)
  }

  // ---- district pins (full map only) ----------------------------------
  // Drawn last, and outside the world-space clip, so a pin may sit in the
  // letterbox margin beside the plan — where there is room for a name — and
  // still point at the district it belongs to.
  if (opts.detail) {
    const pins = layoutPins(
      ctx,
      frame,
      DISTRICTS.map((d) => ({
        id: d.id,
        label: d.short,
        color: d.groundColor,
        anchorX: toX(d.center[0]),
        anchorY: toY(d.center[1]),
        badge: errandsByDistrict.get(d.name) ?? 0,
      })),
    )
    drawPins(ctx, pins, pal, opts.highlightDistrictId ?? null)
  }
}
