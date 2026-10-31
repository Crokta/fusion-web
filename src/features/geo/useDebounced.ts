import { useEffect, useState } from 'react'

/** The value once it has stopped changing for `ms`: one gazetteer query per pause in typing. */
export function useDebounced<T>(value: T, ms: number): T {
  const [settled, setSettled] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setSettled(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return settled
}
