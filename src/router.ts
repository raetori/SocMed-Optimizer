// A tiny hash router. Hash routing keeps every page on one static file, so
// Cloudflare Pages needs no rewrite rules and deep links work on refresh.

import { useEffect, useState } from 'react'

export type Route = '/' | '/optimize' | '/check' | '/guides' | `/guides/${string}`

function current(): string {
  const h = window.location.hash.replace(/^#/, '')
  return h || '/'
}

export function navigate(to: string) {
  if (current() === to) return
  window.location.hash = to
  window.scrollTo(0, 0)
}

export function useRoute(): string {
  const [route, setRoute] = useState(current)
  useEffect(() => {
    const on = () => setRoute(current())
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return route
}
