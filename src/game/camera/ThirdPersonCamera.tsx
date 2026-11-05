import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { clamp, damp } from '../../shared/math'
import { useWorldStore } from '../../state/worldStore'
import { cameraState, orbit, zoom } from './cameraState'
import { playerState } from '../player/playerState'

const EYE_HEIGHT = 1.45
/** Pointer travel past which a press counts as a camera drag, not a tap. */
const DRAG_THRESHOLD = 4

const desired = new THREE.Vector3()
const lookTarget = new THREE.Vector3()

/**
 * Over-the-shoulder camera.
 *
 * Drag anywhere on the city to orbit, scroll to zoom, and the whole thing eases
 * toward the player so movement feels smooth rather than snapped.
 */
export function ThirdPersonCamera() {
  const { camera, gl } = useThree()
  const position = useRef(new THREE.Vector3())
  const focus = useRef(new THREE.Vector3())
  const primed = useRef(false)

  useFrame((_, rawDelta) => {
    const dt = clamp(rawDelta, 0, 0.05)
    const horizontal = cameraState.distance * Math.cos(cameraState.pitch)

    desired.set(
      playerState.x + Math.sin(cameraState.yaw) * horizontal,
      EYE_HEIGHT + cameraState.distance * Math.sin(cameraState.pitch),
      playerState.z + Math.cos(cameraState.yaw) * horizontal,
    )
    lookTarget.set(playerState.x, EYE_HEIGHT, playerState.z)

    if (!primed.current) {
      position.current.copy(desired)
      focus.current.copy(lookTarget)
      primed.current = true
    }

    position.current.lerp(desired, damp(9, dt))
    focus.current.lerp(lookTarget, damp(12, dt))

    camera.position.copy(position.current)
    camera.lookAt(focus.current)
  })

  useEffect(() => {
    const element = gl.domElement
    let dragging = false
    let moved = false
    let lastX = 0
    let lastY = 0

    const onDown = (event: PointerEvent) => {
      dragging = true
      moved = false
      lastX = event.clientX
      lastY = event.clientY
    }

    const onMove = (event: PointerEvent) => {
      if (!dragging) return
      const dx = event.clientX - lastX
      const dy = event.clientY - lastY
      lastX = event.clientX
      lastY = event.clientY

      if (!moved && Math.abs(dx) + Math.abs(dy) > DRAG_THRESHOLD) {
        moved = true
        useWorldStore.getState().setCameraDragging(true)
      }
      if (moved) orbit(dx, dy)
    }

    const onUp = () => {
      dragging = false
      if (!moved) return
      moved = false
      // The click that follows this pointerup must still see the drag flag, so
      // release it on the next task instead of immediately.
      window.setTimeout(() => useWorldStore.getState().setCameraDragging(false), 0)
    }

    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      zoom(event.deltaY)
    }

    element.addEventListener('pointerdown', onDown)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    element.addEventListener('wheel', onWheel, { passive: false })

    return () => {
      element.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      element.removeEventListener('wheel', onWheel)
    }
  }, [gl])

  return null
}
