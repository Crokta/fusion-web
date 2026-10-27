/**
 * RFC 9457 problem details, as returned by every gateway route.
 *
 * The `code` is the stable, machine-readable part; `title` and `detail` are for people. The UI
 * branches on `code` only, so wording can change server side without breaking a screen.
 */

export type ProblemCode =
  | 'capability_not_authorised'
  | 'self_approval_forbidden'
  | 'requirement_missing'
  | 'unsupported_sentences'
  | 'external_ai_not_permitted'
  | 'precondition_failed'
  | 'not_found'
  | 'validation_failed'
  | 'unauthenticated'
  | 'network_error'
  | 'internal_error'
  | (string & {})

export interface ProblemDetails {
  type?: string
  title: string
  status: number
  detail?: string
  instance?: string
  code: ProblemCode
  traceId?: string
  errors?: Record<string, string[]>
}

export class ApiError extends Error {
  readonly problem: ProblemDetails

  constructor(problem: ProblemDetails) {
    super(problem.detail ?? problem.title)
    this.name = 'ApiError'
    this.problem = problem
  }

  get code(): ProblemCode {
    return this.problem.code
  }

  get status(): number {
    return this.problem.status
  }
}

/** Builds an ApiError from any response body, tolerating proxies that return HTML or nothing. */
export function toProblem(status: number, body: unknown, statusText = ''): ProblemDetails {
  if (body && typeof body === 'object' && 'title' in body) {
    const b = body as Partial<ProblemDetails>
    return {
      ...b,
      title: String(b.title),
      status: typeof b.status === 'number' ? b.status : status,
      code: b.code ?? fallbackCode(status),
    }
  }
  return {
    title: statusText || `Request failed with status ${status}`,
    status,
    code: fallbackCode(status),
  }
}

function fallbackCode(status: number): ProblemCode {
  if (status === 401) return 'unauthenticated'
  if (status === 403) return 'capability_not_authorised'
  if (status === 404) return 'not_found'
  if (status === 412) return 'precondition_failed'
  if (status === 400 || status === 422) return 'validation_failed'
  return 'internal_error'
}

const FRIENDLY: Partial<Record<string, string>> = {
  capability_not_authorised: 'Your active role is not permitted to do this.',
  self_approval_forbidden: 'You cannot approve your own work. Another reviewer must decide.',
  requirement_missing: 'A live collection requirement is needed first.',
  precondition_failed: 'Someone else changed this record. Reload and try again.',
  network_error: 'The gateway could not be reached.',
}

export function describeError(error: unknown): string {
  if (error instanceof ApiError) return FRIENDLY[error.code] ?? error.message
  if (error instanceof Error) return error.message
  return 'Something went wrong.'
}
