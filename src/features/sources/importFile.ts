import type { Reliability, SourceInput, SourceKind } from '@/api/types'

/**
 * Reads a sources file for import: a JSON array, or `{"sources": [...]}` as in
 * fusion-intake/seed/sources.json. Each entry needs name, kind and url; reliability is optional
 * and anything else (a note) is dropped. Rows that cannot be read are reported, not sent; intake
 * checks the rest again and skips addresses it already holds.
 */

const KINDS: readonly SourceKind[] = ['feed', 'site', 'official', 'social']
const GRADES: readonly Reliability[] = ['A', 'B', 'C', 'D', 'E', 'F']
export const IMPORT_LIMIT = 200

export interface ParsedImport {
  sources: SourceInput[]
  problems: string[]
  /** Social sources, each a paid Bright Data job once approved. */
  social: number
}

export function parseSourceImport(text: string): ParsedImport {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return { sources: [], problems: ['The file is not JSON.'], social: 0 }
  }
  const rows = Array.isArray(data)
    ? data
    : data && typeof data === 'object' && Array.isArray((data as { sources?: unknown }).sources)
      ? (data as { sources: unknown[] }).sources
      : null
  if (!rows)
    return {
      sources: [],
      problems: ['Expected a list of sources, or {"sources": [...]}.'],
      social: 0,
    }

  const sources: SourceInput[] = []
  const problems: string[] = []
  rows.forEach((row, i) => {
    const r = (row ?? {}) as Record<string, unknown>
    const at = `Row ${i + 1}`
    const name = typeof r.name === 'string' ? r.name.trim() : ''
    const kind = typeof r.kind === 'string' ? (r.kind.toLowerCase() as SourceKind) : null
    const url = typeof r.url === 'string' ? r.url.trim() : ''
    const grade =
      typeof r.reliability === 'string' ? (r.reliability.toUpperCase() as Reliability) : null
    if (!name) return problems.push(`${at}: no name.`)
    if (!kind || !KINDS.includes(kind))
      return problems.push(`${at} (${name}): kind is feed, site, official or social.`)
    if (!/^https?:\/\/[^\s/]+/i.test(url))
      return problems.push(`${at} (${name}): the address is not an http or https link.`)
    if (grade && !GRADES.includes(grade))
      return problems.push(`${at} (${name}): reliability is a grade from A to F.`)
    sources.push({ name, kind, url, reliability: grade })
  })
  if (sources.length > IMPORT_LIMIT)
    problems.push(
      `At most ${IMPORT_LIMIT} sources go in one import; only the first ${IMPORT_LIMIT} are sent.`,
    )
  const sent = sources.slice(0, IMPORT_LIMIT)
  return { sources: sent, problems, social: sent.filter((s) => s.kind === 'social').length }
}
