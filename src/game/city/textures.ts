import * as THREE from 'three'

/**
 * Procedural textures for the city.
 *
 * Everything is drawn into a canvas at runtime so the game has no image or font
 * downloads to wait on: signs and facades are available on the very first frame.
 */

let facadeTexture: THREE.Texture | null = null

/** A light wall with a grid of dark windows, tinted per building by material colour. */
export function makeFacadeTexture(): THREE.Texture {
  if (facadeTexture) return facadeTexture

  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 64
  const ctx = canvas.getContext('2d')!

  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, 64, 64)

  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 2; col++) {
      const x = 9 + col * 32
      const y = 10 + row * 32
      ctx.fillStyle = 'rgba(22, 30, 44, 0.55)'
      ctx.fillRect(x, y, 20, 19)
      ctx.fillStyle = 'rgba(255, 255, 255, 0.4)'
      ctx.fillRect(x, y, 20, 4)
    }
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.colorSpace = THREE.SRGBColorSpace
  facadeTexture = texture
  return texture
}

const signCache = new Map<string, THREE.Texture>()

/** A painted shop board with Nigerian signage text. Cached per string. */
export function makeSignTexture(
  text: string,
  background = '#141b28',
  foreground = '#ffd166',
): THREE.Texture {
  const key = `${text}|${background}|${foreground}`
  const cached = signCache.get(key)
  if (cached) return cached

  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 96
  const ctx = canvas.getContext('2d')!

  ctx.fillStyle = background
  ctx.fillRect(0, 0, 512, 96)
  ctx.strokeStyle = foreground
  ctx.lineWidth = 5
  ctx.strokeRect(7, 7, 498, 82)

  ctx.fillStyle = foreground
  ctx.font = 'bold 46px system-ui, "Segoe UI", Arial, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text.toUpperCase(), 256, 52)

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  signCache.set(key, texture)
  return texture
}
