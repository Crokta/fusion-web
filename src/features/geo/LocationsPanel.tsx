import { Check, MapPin, MapPinned, Plus, Trash2, X } from 'lucide-react'
import { useState } from 'react'
import {
  useAttachLocation,
  useConfirmLocation,
  useLocations,
  usePlaces,
  useRemoveLocation,
} from '@/api/queries'
import { api, describeError } from '@/api'
import type { LocationPrecision, LocationSubject, Place } from '@/api/types'
import { can, useAuth } from '@/auth/AuthProvider'
import {
  Button,
  EmptyState,
  ErrorNotice,
  Field,
  Panel,
  Segmented,
  SkeletonRows,
  inputClass,
} from '@/components/ui'
import { relative } from '@/lib/format'
import { GeoMap } from './LazyGeoMap'
import { OriginBadge, PrecisionBadge, formatPoint, kindLabel, placeContext } from './parts'
import { useDebounced } from './useDebounced'

/**
 * Where a case or story is (ADR 0018). Analysts place it by hand, from the gazetteer or with a
 * pin, saying whether the place is confirmed or estimated. Places the text names (E20) arrive
 * here as estimated, for an analyst to confirm or remove.
 */
export function LocationsPanel({
  subjectType,
  subjectId,
  className,
}: {
  subjectType: LocationSubject
  subjectId: string
  className?: string
}) {
  const { activeRole } = useAuth()
  const reads =
    subjectType === 'case' ? can.readCaseLocations(activeRole) : can.readStoryLocations(activeRole)
  const places = subjectType === 'case' ? can.writeCase(activeRole) : can.workTriage(activeRole)
  const locations = useLocations(subjectType, subjectId, reads)
  const confirm = useConfirmLocation()
  const remove = useRemoveLocation()
  const [adding, setAdding] = useState(false)

  if (!reads) return null
  const busy = confirm.isPending || remove.isPending
  const error = confirm.error ?? remove.error

  return (
    <Panel
      className={className}
      title="Locations"
      icon={MapPinned}
      actions={
        places &&
        !adding && (
          <Button size="xs" icon={Plus} onClick={() => setAdding(true)}>
            Add a location
          </Button>
        )
      }
    >
      {adding && (
        <AddLocation
          subjectType={subjectType}
          subjectId={subjectId}
          onDone={() => setAdding(false)}
        />
      )}
      {error && <p className="mb-2 text-xs text-red">{describeError(error)}</p>}
      {locations.error ? (
        <ErrorNotice error={locations.error} onRetry={() => locations.refetch()} />
      ) : !locations.data ? (
        <SkeletonRows rows={2} />
      ) : locations.data.length === 0 ? (
        !adding && (
          <EmptyState icon={MapPin} title={`This ${subjectType} is not on the map yet`}>
            {places ? 'Add where it happened, from the gazetteer or with a pin.' : undefined}
          </EmptyState>
        )
      ) : (
        <ul className="divide-y divide-line-soft">
          {locations.data.map((l) => (
            <li key={l.id} className="flex items-start gap-3 py-2.5">
              <MapPin size={14} className="mt-0.5 shrink-0 text-cyan/80" aria-hidden />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[13px] text-ink">{l.label}</span>
                  <PrecisionBadge precision={l.precision} />
                  <OriginBadge origin={l.origin} />
                </div>
                <p className="mt-0.5 text-[11px] text-ink-muted">
                  {formatPoint(l.lat, l.lon)} · added by {l.addedBy} {relative(l.addedAt)}
                  {l.confirmedBy && l.origin === 'extracted' && ` · confirmed by ${l.confirmedBy}`}
                </p>
                {l.note && <p className="mt-1 text-xs text-ink-2">{l.note}</p>}
              </div>
              {places && (
                <div className="flex shrink-0 gap-1">
                  {l.precision === 'estimated' && (
                    <Button
                      size="xs"
                      variant="success"
                      icon={Check}
                      disabled={busy}
                      onClick={() => confirm.mutate({ id: l.id, version: l.version })}
                    >
                      Confirm
                    </Button>
                  )}
                  <Button
                    size="xs"
                    variant="ghost"
                    icon={Trash2}
                    disabled={busy}
                    aria-label={`Remove ${l.label}`}
                    onClick={() => remove.mutate({ id: l.id, version: l.version })}
                  >
                    Remove
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

type Mode = 'gazetteer' | 'pin'

function AddLocation({
  subjectType,
  subjectId,
  onDone,
}: {
  subjectType: LocationSubject
  subjectId: string
  onDone: () => void
}) {
  const attach = useAttachLocation()
  const [mode, setMode] = useState<Mode>('gazetteer')
  const [text, setText] = useState('')
  const q = useDebounced(text.trim(), 250)
  const found = usePlaces(mode === 'gazetteer' ? q : '')
  const [place, setPlace] = useState<Place>()
  const [pin, setPin] = useState<{ lat: number; lon: number }>()
  const [label, setLabel] = useState('')
  const [precision, setPrecision] = useState<LocationPrecision>('estimated')
  const [note, setNote] = useState('')

  const ready = mode === 'gazetteer' ? !!place : !!pin && label.trim().length > 0

  const onPick = async (lat: number, lon: number) => {
    setPin({ lat, lon })
    // Suggest a name from the nearest place; the analyst can change it.
    if (!label.trim()) {
      const near = await api.nearestPlace(lat, lon).catch(() => null)
      if (near) setLabel(`Near ${near.name}`)
    }
  }

  const save = () =>
    attach.mutate(
      mode === 'gazetteer'
        ? { subjectType, subjectId, placeId: place!.id, precision, note: note.trim() || undefined }
        : {
            subjectType,
            subjectId,
            label: label.trim(),
            lat: pin!.lat,
            lon: pin!.lon,
            precision,
            note: note.trim() || undefined,
          },
      { onSuccess: onDone },
    )

  return (
    <div className="mb-3 space-y-3 rounded-md border border-line bg-canvas/60 p-3">
      <div className="flex items-center justify-between gap-2">
        <Segmented
          label="How to place it"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'gazetteer', label: 'From the gazetteer' },
            { value: 'pin', label: 'Drop a pin' },
          ]}
        />
        <Button size="xs" variant="ghost" icon={X} onClick={onDone} aria-label="Cancel">
          Cancel
        </Button>
      </div>
      {mode === 'gazetteer' ? (
        <Field label="Place">
          <input
            className={inputClass}
            value={place ? place.name : text}
            onChange={(e) => {
              setPlace(undefined)
              setText(e.target.value)
            }}
            placeholder="A state, LGA, town or village"
            autoFocus
          />
          {!place && q.length >= 2 && (
            <ul className="mt-1 max-h-52 divide-y divide-line-soft overflow-y-auto rounded-md border border-line">
              {(found.data ?? []).map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-tint/[0.04]"
                    onClick={() => setPlace(p)}
                  >
                    <span className="flex-1 truncate text-ink">
                      {p.name} <span className="text-ink-muted">· {placeContext(p)}</span>
                    </span>
                    <span className="text-[10.5px] text-ink-faint">
                      {kindLabel(p.kind, p.country)}
                    </span>
                  </button>
                </li>
              ))}
              {found.data?.length === 0 && (
                <li className="px-3 py-1.5 text-xs text-ink-muted">No place by that name</li>
              )}
            </ul>
          )}
        </Field>
      ) : (
        <>
          <p className="text-xs text-ink-muted">Click the map where it happened.</p>
          <GeoMap className="h-64" onPick={onPick} marker={pin} />
          <Field label="Name for this point" hint={pin ? formatPoint(pin.lat, pin.lon) : undefined}>
            <input
              className={inputClass}
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Road south of Gwoza"
              maxLength={200}
            />
          </Field>
        </>
      )}
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <span className="eyebrow mb-1.5 block">How sure</span>
          <Segmented
            label="Precision"
            value={precision}
            onChange={setPrecision}
            options={[
              { value: 'estimated', label: 'Estimated' },
              { value: 'confirmed', label: 'Confirmed' },
            ]}
          />
        </div>
        <label className="block min-w-48 flex-1">
          <span className="eyebrow mb-1.5 block">Note (optional)</span>
          <input
            className={inputClass}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="What the location rests on"
            maxLength={1000}
          />
        </label>
        <Button variant="primary" disabled={!ready} loading={attach.isPending} onClick={save}>
          Place it
        </Button>
      </div>
      {attach.error && <p className="text-xs text-red">{describeError(attach.error)}</p>}
    </div>
  )
}
