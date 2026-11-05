/**
 * Keyboard state, held outside React.
 *
 * Movement is read every frame, so routing key state through React would
 * re-render the HUD 60 times a second for no reason.
 */
const pressed = new Set<string>()

export function isDown(key: string): boolean {
  return pressed.has(key.toLowerCase())
}

/** Installs the window listeners. Returns a cleanup function. */
export function installKeyboard(): () => void {
  const onDown = (event: KeyboardEvent) => {
    const target = event.target as HTMLElement | null
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return
    pressed.add(event.key.toLowerCase())
  }
  const onUp = (event: KeyboardEvent) => {
    pressed.delete(event.key.toLowerCase())
  }
  const onBlur = () => pressed.clear()

  window.addEventListener('keydown', onDown)
  window.addEventListener('keyup', onUp)
  window.addEventListener('blur', onBlur)
  return () => {
    window.removeEventListener('keydown', onDown)
    window.removeEventListener('keyup', onUp)
    window.removeEventListener('blur', onBlur)
  }
}
