import { useCallback, useEffect, useRef } from 'react'
import { clearInput, createInput, setInputKey } from '../game/input.js'

// Keyboard state lives in a ref so key events never trigger React renders.
export function useKeyboard({ enabled = true } = {}) {
  const inputRef = useRef(createInput())

  const clear = useCallback(() => {
    clearInput(inputRef.current)
  }, [])

  useEffect(() => {
    const input = inputRef.current
    const onKeyDown = (event) => {
      if (!enabled) return
      if (setInputKey(input, event.code, true)) event.preventDefault()
    }
    const onKeyUp = (event) => {
      if (!enabled) return
      if (setInputKey(input, event.code, false)) event.preventDefault()
    }
    const release = () => clearInput(input)

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', release)
    document.addEventListener('visibilitychange', release)

    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', release)
      document.removeEventListener('visibilitychange', release)
      clearInput(input)
    }
  }, [enabled, clear])

  return { inputRef, clear }
}
