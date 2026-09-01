// 모달 접근성 공통 동작 — KWCAG(2.1.2 키보드 덫 없음 · 2.4.3 초점 순서 · 2.1.1 키보드).
//
// 화면마다 모달 구현이 다르지만(공용 `Dialog` + 시안 치수를 직접 그린 3종) 키보드
// 동작은 같아야 한다: 열면 초점이 안으로 들어가고, Tab 이 밖으로 새지 않고,
// Esc 로 닫히고, 닫으면 **열기 전 초점으로 되돌아간다**.
//
// 시각 디자인은 건드리지 않는다 — 보이지 않는 동작만 붙인다.
import { useEffect, useRef, type RefObject } from 'react'

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

function focusables(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (el) => el.offsetParent !== null || el === document.activeElement,
  )
}

/**
 * 모달 패널에 붙인다. 반환 ref 를 **패널 요소**(role="dialog")에 건다.
 * `open` 이 false 면 아무것도 하지 않는다.
 */
export function useModalA11y(open: boolean, onClose: () => void): RefObject<HTMLDivElement | null> {
  const panel = useRef<HTMLDivElement | null>(null)
  // 최신 onClose 를 참조해 effect 가 매번 다시 붙지 않게 한다(초점 이동이 재실행되면
  // 사용자가 옮긴 초점을 빼앗는다).
  const close = useRef(onClose)
  useEffect(() => {
    close.current = onClose
  }, [onClose])

  useEffect(() => {
    if (!open) return
    const previous = document.activeElement as HTMLElement | null
    const node = panel.current
    // 열면 초점을 모달 안으로. 누를 것이 없으면 패널 자체가 받는다(읽기 전용 모달).
    if (node) {
      const first = focusables(node)[0]
      if (first) first.focus()
      else {
        node.setAttribute('tabindex', '-1')
        node.focus()
      }
    }

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        close.current()
        return
      }
      if (e.key !== 'Tab' || !node) return
      const items = focusables(node)
      if (items.length === 0) {
        e.preventDefault()
        return
      }
      const first = items[0]
      const last = items[items.length - 1]
      const active = document.activeElement
      // 밖으로 새려는 순간에만 잡는다 — 안에서의 Tab 순서는 브라우저에 맡긴다.
      if (!node.contains(active)) {
        e.preventDefault()
        first.focus()
      } else if (e.shiftKey && active === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && active === last) {
        e.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKey)
    const scroll = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = scroll
      previous?.focus?.()
    }
  }, [open])

  return panel
}
