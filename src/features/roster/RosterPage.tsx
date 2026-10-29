import {
  CalendarClock,
  Mail,
  MessageSquareText,
  Plus,
  Trash2,
  TriangleAlert,
  UserRound,
  X,
} from 'lucide-react'
import { useState } from 'react'
import { describeError } from '@/api'
import {
  useAddShift,
  useDutyRoster,
  useOnDutyNow,
  usePeopleSearch,
  useRemoveShift,
} from '@/api/queries'
import { TIER_LABEL, TIERS, type DutyShift, type DutyTier, type PersonContact } from '@/api/types'
import { can, useAuth } from '@/auth/AuthProvider'
import { Modal } from '@/components/Overlay'
import { useToast } from '@/components/Toaster'
import {
  Badge,
  Button,
  EmptyState,
  ErrorNotice,
  Field,
  PageHeader,
  Panel,
  Segmented,
  SkeletonRows,
  type Tone,
  inputClass,
} from '@/components/ui'
import { cn } from '@/lib/cn'
import { clock } from '@/lib/format'

const tierTone: Record<DutyTier, Tone> = {
  analyst: 'cyan',
  supervisor: 'violet',
  centre_lead: 'amber',
}

/**
 * Who alerts go to (architecture §4.3). An alert starts with the duty analyst and climbs a tier
 * each time its acknowledgement timeout passes; only minutes with someone on duty count, and a
 * tier with nobody on it is skipped at once.
 */
export function RosterPage() {
  const { activeRole } = useAuth()
  const manage = can.manageRoster(activeRole)
  const [adding, setAdding] = useState(false)

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        eyebrow="Operations"
        title="Duty roster"
        description="Alerts go to whoever is on duty at their tier, in the app, by email and by SMS. A tier with nobody on duty is skipped; only minutes with someone on duty count towards the acknowledgement timeout."
        actions={
          manage ? (
            <Button variant="primary" icon={Plus} onClick={() => setAdding(true)}>
              Add shift
            </Button>
          ) : undefined
        }
      />
      <OnDutyNow />
      <Shifts manage={manage} />
      {manage && <AddShiftModal open={adding} onClose={() => setAdding(false)} />}
    </div>
  )
}

function OnDutyNow() {
  const now = useOnDutyNow()
  if (now.isError) return <ErrorNotice error={now.error} onRetry={() => now.refetch()} />
  return (
    <div className="mb-4 grid gap-3 sm:grid-cols-3">
      {TIERS.map((tier, level) => {
        const people = now.data?.find((t) => t.tier === tier)?.people ?? []
        return (
          <Panel
            key={tier}
            eyebrow={`L${level} · on duty now`}
            title={TIER_LABEL[tier]}
            icon={UserRound}
            bodyClassName="px-4 py-3"
          >
            {now.isPending ? (
              <div className="h-10 animate-pulse rounded bg-tint/[0.03]" />
            ) : people.length === 0 ? (
              <p className="flex items-start gap-1.5 text-[12px] text-amber">
                <TriangleAlert size={13} className="mt-0.5 shrink-0" />
                Nobody. Alerts skip to the{' '}
                {level < 2 ? TIER_LABEL[TIERS[level + 1]!].toLowerCase() : 'top and wait'}.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {people.map((p) => (
                  <li key={p.id} className="flex items-center gap-2 text-[12.5px]">
                    <span className="min-w-0 flex-1 truncate font-medium text-ink">{p.name}</span>
                    <Reach shift={p} />
                    <span className="num text-[11px] text-ink-faint">until {clock(p.endsAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        )
      })}
    </div>
  )
}

/** Which channels beyond in-app reach this person. */
function Reach({ shift }: { shift: DutyShift }) {
  return (
    <span className="flex shrink-0 gap-1 text-ink-faint">
      {shift.email && (
        <span title={shift.email}>
          <Mail size={12} aria-label="email" />
        </span>
      )}
      {shift.phone && (
        <span title={shift.phone}>
          <MessageSquareText size={12} aria-label="SMS" />
        </span>
      )}
    </span>
  )
}

const dayLabel = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' })

function Shifts({ manage }: { manage: boolean }) {
  const roster = useDutyRoster()
  const remove = useRemoveShift()
  const toast = useToast()
  const shifts = roster.data ?? []
  const days = [...new Set(shifts.map((s) => dayLabel(s.startsAt)))]

  return (
    <Panel
      title="Shifts"
      icon={CalendarClock}
      actions={<span className="text-[11px] text-ink-faint">last 12 hours to a week ahead</span>}
      bodyClassName="p-0"
    >
      {roster.isPending ? (
        <SkeletonRows rows={4} />
      ) : roster.isError ? (
        <ErrorNotice error={roster.error} onRetry={() => roster.refetch()} />
      ) : shifts.length === 0 ? (
        <EmptyState icon={CalendarClock} title="No shifts">
          With nobody on the roster, an alert reaches no one: it climbs to the top tier and is
          recorded as unrouted.
        </EmptyState>
      ) : (
        days.map((day) => (
          <section key={day}>
            <h3 className="eyebrow border-b border-line-soft bg-tint/[0.015] px-4 py-1.5">{day}</h3>
            <ul>
              {shifts
                .filter((s) => dayLabel(s.startsAt) === day)
                .map((s) => {
                  const over = Date.parse(s.endsAt) <= Date.now()
                  return (
                    <li
                      key={s.id}
                      className={cn(
                        'flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line-soft px-4 py-2.5 last:border-0',
                        over && 'opacity-55',
                      )}
                    >
                      <Badge tone={tierTone[s.tier]} className="w-24 justify-center">
                        {TIER_LABEL[s.tier]}
                      </Badge>
                      <span className="min-w-0 flex-1 basis-40 truncate text-[13px] font-medium text-ink">
                        {s.name}
                      </span>
                      <span className="num text-[12px] text-ink-muted">
                        {clock(s.startsAt)}–{clock(s.endsAt)}
                        {dayLabel(s.endsAt) !== day && ` (${dayLabel(s.endsAt)})`}
                      </span>
                      <span className="hidden min-w-0 basis-52 truncate text-[11.5px] text-ink-faint md:block">
                        {[s.email, s.phone].filter(Boolean).join(' · ') || 'in-app only'}
                      </span>
                      {manage && (
                        <Button
                          size="xs"
                          variant="ghost"
                          icon={Trash2}
                          aria-label={`Remove ${s.name}'s shift`}
                          onClick={() =>
                            remove.mutate(s.id, {
                              onSuccess: () => toast({ title: 'Shift removed', tone: 'success' }),
                              onError: (e) =>
                                toast({
                                  title: 'Not removed',
                                  detail: describeError(e),
                                  tone: 'error',
                                }),
                            })
                          }
                        />
                      )}
                    </li>
                  )
                })}
            </ul>
          </section>
        ))
      )}
    </Panel>
  )
}

/** A datetime-local value (local time, minutes) for a Date. */
const local = (d: Date) => {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

function AddShiftModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const add = useAddShift()
  const toast = useToast()
  const [tier, setTier] = useState<DutyTier>('analyst')
  const [person, setPerson] = useState<PersonContact | null>(null)
  const [query, setQuery] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [startsAt, setStartsAt] = useState(() => local(new Date()))
  const [endsAt, setEndsAt] = useState(() => local(new Date(Date.now() + 8 * 3600_000)))
  const found = usePeopleSearch(person ? '' : query)

  const reset = () => {
    setPerson(null)
    setQuery('')
    setEmail('')
    setPhone('')
    add.reset()
  }
  const close = () => {
    reset()
    onClose()
  }

  const submit = () => {
    if (!person) return
    add.mutate(
      {
        tier,
        userId: person.id,
        name: person.name,
        startsAt: new Date(startsAt).toISOString(),
        endsAt: new Date(endsAt).toISOString(),
        email: email.trim() || undefined,
        phone: phone.replace(/\s+/g, '') || undefined,
      },
      {
        onSuccess: (s) => {
          toast({
            title: `${s.name} is on the roster`,
            detail: TIER_LABEL[s.tier],
            tone: 'success',
          })
          close()
        },
      },
    )
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title="Add a shift"
      description="The person receives every alert at this tier while the shift lasts."
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button variant="primary" loading={add.isPending} disabled={!person} onClick={submit}>
            Add shift
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Tier">
          <Segmented
            label="Tier"
            value={tier}
            onChange={setTier}
            options={TIERS.map((t) => ({ value: t, label: TIER_LABEL[t] }))}
          />
        </Field>
        <Field label="Person" hint="Search the directory by name, username or email.">
          {person ? (
            <div className="flex items-center gap-2 rounded-md border border-line-strong/80 bg-canvas px-2.5 py-1.5 text-[13px]">
              <span className="flex-1 font-medium text-ink">{person.name}</span>
              {person.username && (
                <span className="text-[11.5px] text-ink-faint">{person.username}</span>
              )}
              <button
                type="button"
                aria-label="Choose someone else"
                onClick={() => setPerson(null)}
              >
                <X size={14} className="text-ink-muted hover:text-ink" />
              </button>
            </div>
          ) : (
            <div className="relative">
              <input
                className={inputClass}
                value={query}
                placeholder="e.g. Ada"
                onChange={(e) => setQuery(e.target.value)}
                autoFocus
              />
              {query.trim().length >= 2 && (
                <ul className="absolute top-full right-0 left-0 z-10 mt-1 max-h-56 overflow-y-auto rounded-md border border-line-strong bg-panel py-1 shadow-pop">
                  {found.isPending ? (
                    <li className="px-3 py-2 text-[12px] text-ink-faint">Searching…</li>
                  ) : (found.data ?? []).length === 0 ? (
                    <li className="px-3 py-2 text-[12px] text-ink-faint">Nobody matches.</li>
                  ) : (
                    found.data!.map((p) => (
                      <li key={p.id}>
                        <button
                          type="button"
                          className="flex w-full items-baseline gap-2 px-3 py-1.5 text-left text-[12.5px] hover:bg-tint/[0.05]"
                          onClick={() => {
                            setPerson(p)
                            setEmail(p.email ?? '')
                          }}
                        >
                          <span className="font-medium text-ink">{p.name}</span>
                          <span className="truncate text-[11px] text-ink-faint">
                            {p.email ?? p.username}
                          </span>
                        </button>
                      </li>
                    ))
                  )}
                </ul>
              )}
            </div>
          )}
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Starts">
            <input
              type="datetime-local"
              className={inputClass}
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
            />
          </Field>
          <Field label="Ends" hint="At most 24 hours after the start.">
            <input
              type="datetime-local"
              className={inputClass}
              value={endsAt}
              onChange={(e) => setEndsAt(e.target.value)}
            />
          </Field>
          <Field label="Email" hint="Optional. Alerts by email.">
            <input
              type="email"
              className={inputClass}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
          <Field label="Mobile" hint="Optional, international form: +234…">
            <input
              type="tel"
              className={inputClass}
              value={phone}
              placeholder="+2348012345678"
              onChange={(e) => setPhone(e.target.value)}
            />
          </Field>
        </div>
        {add.isError && <p className="text-[12px] text-red">{describeError(add.error)}</p>}
      </div>
    </Modal>
  )
}
