import { useEffect, useRef, type MouseEvent } from 'react'
import { drawCityMap, makeProjection, type MapFrame } from './cityMapRenderer'

interface CityMapCanvasProps {
  /** The full map labels everything; the minimap stays quiet. */
  detail: boolean
  /** Inset kept clear around the drawing, in CSS pixels. */
  padding?: number
  /** Redraw interval — the crowd only needs a light tick, not 60fps. */
  refreshMs?: number
  highlightDistrictId?: string | null
  /** Called with world coordinates when the map is clicked or tapped. */
  onPick?: (world: { x: number; z: number }) => void
  /** Called with world coordinates as the pointer moves across the map. */
  onHover?: (world: { x: number; z: number }) => void
  className?: string
}

/**
 * The one canvas every map in the game draws into.
 *
 * It owns nothing but the drawing surface: it keeps the backing store crisp for
 * the device pixel ratio, reframes on resize (so it is already responsive), and
 * hands world coordinates back on a tap. What is drawn comes entirely from the
 * blueprint renderer.
 */
export function CityMapCanvas({
  detail,
  padding = 10,
  refreshMs = 120,
  highlightDistrictId = null,
  onPick,
  onHover,
  className,
}: CityMapCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const frameRef = useRef<MapFrame>({ width: 0, height: 0, padding })
  const optsRef = useRef({ detail, highlightDistrictId, padding })
  optsRef.current = { detail, highlightDistrictId, padding }

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let raf = 0
    let last = 0

    const resize = () => {
      // Measure the layout box, not getBoundingClientRect(): the map panel
      // animates in with a transform, and a transformed rect would size the
      // backing store to the scaled-down element — a tiny, blurry map — with
      // nothing to re-measure it once the animation settles.
      const width = Math.max(1, Math.round(canvas.clientWidth))
      const height = Math.max(1, Math.round(canvas.clientHeight))
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
        canvas.width = width * dpr
        canvas.height = height * dpr
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      frameRef.current = { width, height, padding: optsRef.current.padding }
    }

    const observer = new ResizeObserver(resize)
    observer.observe(canvas)
    resize()

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop)
      if (now - last < refreshMs) return
      last = now
      const frame = frameRef.current
      if (frame.width < 2 || frame.height < 2) return
      drawCityMap(ctx, frame, optsRef.current)
    }
    raf = requestAnimationFrame(loop)

    return () => {
      cancelAnimationFrame(raf)
      observer.disconnect()
    }
  }, [refreshMs])

  const worldAt = (event: MouseEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    const projection = makeProjection(frameRef.current)
    return projection.toWorld(event.clientX - rect.left, event.clientY - rect.top)
  }

  return (
    <canvas
      ref={canvasRef}
      className={className}
      onClick={(event) => onPick?.(worldAt(event))}
      onPointerMove={(event) => onHover?.(worldAt(event))}
    />
  )
}
