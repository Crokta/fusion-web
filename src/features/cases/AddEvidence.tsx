import { CheckCircle2, CircleAlert, Globe, Link2, LoaderCircle, Plus, Upload } from 'lucide-react'
import { useRef, useState, type DragEvent, type FormEvent } from 'react'
import { describeError } from '@/api/problem'
import { useCapture, useCaptureLink, useUploadEvidence } from '@/api/queries'
import type { UploadProgress } from '@/api/types'
import { Button, Field, Segmented, inputClass } from '@/components/ui'
import { Modal } from '@/components/Overlay'
import { cn } from '@/lib/cn'

type Mode = 'file' | 'link'

/** One file on its way: hashing and sending, then sealed or refused. */
interface Sending {
  key: string
  name: string
  size: number
  progress: UploadProgress | null
  state: 'sending' | 'sealed' | 'failed'
  error?: string
}

const mb = (bytes: number) =>
  bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB`

/**
 * Adding evidence to a case (E26): a file the analyst holds, or a link for collector to capture.
 * Either way evidence seals it as an original (SHA-256, RFC 3161, custody) and casework attaches
 * it; an image or video is then screened by media, so its verdict appears on the evidence list.
 */
export function AddEvidence({ caseId }: { caseId: string }) {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<Mode>('file')
  return (
    <>
      <Button size="xs" variant="secondary" icon={Plus} onClick={() => setOpen(true)}>
        Add evidence
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Add evidence"
        description="Each file or capture is sealed as an original. Images and video are then screened for signs of AI generation."
      >
        <div className="space-y-4 p-5">
          <Segmented
            label="How to add evidence"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'file', label: 'Upload a file' },
              { value: 'link', label: 'Capture a link' },
            ]}
          />
          {mode === 'file' ? <UploadFiles caseId={caseId} /> : <CaptureLink caseId={caseId} />}
        </div>
      </Modal>
    </>
  )
}

function UploadFiles({ caseId }: { caseId: string }) {
  const upload = useUploadEvidence(caseId)
  const input = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)
  const [sending, setSending] = useState<Sending[]>([])

  const patch = (key: string, change: Partial<Sending>) =>
    setSending((all) => all.map((s) => (s.key === key ? { ...s, ...change } : s)))

  // One at a time: each is hashed in memory first, and the store link is short-lived.
  const send = async (files: File[]) => {
    const queued = files.map((f) => ({
      key: crypto.randomUUID(),
      name: f.name,
      size: f.size,
      progress: null,
      state: 'sending' as const,
    }))
    setSending((all) => [...queued, ...all])
    for (const [i, file] of files.entries()) {
      const key = queued[i]!.key
      try {
        await upload.mutateAsync({ file, onProgress: (progress) => patch(key, { progress }) })
        patch(key, { state: 'sealed' })
      } catch (e) {
        patch(key, { state: 'failed', error: describeError(e) })
      }
    }
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setOver(false)
    const files = Array.from(e.dataTransfer.files)
    if (files.length) void send(files)
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault()
          setOver(true)
        }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
        className={cn(
          'flex w-full flex-col items-center gap-2 rounded-lg border border-dashed px-4 py-8 text-center transition-colors',
          over ? 'border-cyan/70 bg-cyan/[0.06]' : 'border-line-strong hover:border-cyan/50',
        )}
      >
        <Upload size={20} className="text-cyan" aria-hidden />
        <span className="text-[13px] font-medium text-ink">Drop files here, or choose them</span>
        <span className="text-[11.5px] text-ink-faint">
          Images, video, audio or documents, up to 2 GB each
        </span>
      </button>
      <input
        ref={input}
        type="file"
        multiple
        className="sr-only"
        aria-label="Files to add"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? [])
          e.target.value = ''
          if (files.length) void send(files)
        }}
      />
      {sending.length > 0 && (
        <ul className="divide-y divide-line-soft rounded-md border border-line-soft">
          {sending.map((s) => (
            <li key={s.key} className="flex items-center gap-3 px-3 py-2 text-[12px]">
              <StateIcon state={s.state} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-ink">{s.name}</p>
                <p className="text-[11px] text-ink-faint">
                  {s.state === 'sending'
                    ? s.progress
                      ? `Sending ${Math.round((s.progress.loaded / s.progress.total) * 100)}% of ${mb(s.size)}`
                      : `Hashing ${mb(s.size)}`
                    : s.state === 'sealed'
                      ? 'Sealed as an original. Screening follows for images and video.'
                      : s.error}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function CaptureLink({ caseId }: { caseId: string }) {
  const capture = useCaptureLink(caseId)
  const [url, setUrl] = useState('')
  const [includeMedia, setIncludeMedia] = useState(true)
  const [requested, setRequested] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)

  const valid = /^https?:\/\/\S+\.\S+/.test(url.trim())
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!valid) return
    setError(null)
    capture.mutate(
      { url: url.trim(), includeMedia },
      {
        onSuccess: (c) => {
          setRequested((all) => [c.id, ...all])
          setUrl('')
        },
        onError: (err) => setError(describeError(err)),
      },
    )
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <Field
        label="Link"
        hint="Collector saves the page as it is now: its HTML, a full-page screenshot and a web archive (WARC)."
      >
        <input
          type="url"
          inputMode="url"
          required
          placeholder="https://"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          className={inputClass}
        />
      </Field>
      <label className="flex items-center gap-2 text-[12.5px] text-ink-2">
        <input
          type="checkbox"
          checked={includeMedia}
          onChange={(e) => setIncludeMedia(e.target.checked)}
        />
        Also keep its photos and video, each as an original
      </label>
      {error && <p className="text-[12px] text-red">{error}</p>}
      <div className="flex justify-end">
        <Button
          type="submit"
          variant="primary"
          icon={Link2}
          loading={capture.isPending}
          disabled={!valid}
        >
          Capture
        </Button>
      </div>
      {requested.length > 0 && (
        <ul className="divide-y divide-line-soft rounded-md border border-line-soft">
          {requested.map((id) => (
            <CaptureRow key={id} id={id} caseId={caseId} />
          ))}
        </ul>
      )}
    </form>
  )
}

function CaptureRow({ id, caseId }: { id: string; caseId: string }) {
  const { data } = useCapture(id, caseId)
  if (!data) return null
  const state =
    data.status === 'requested' ? 'sending' : data.status === 'completed' ? 'sealed' : 'failed'
  return (
    <li className="flex items-center gap-3 px-3 py-2 text-[12px]">
      <StateIcon state={state} />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 truncate font-medium text-ink">
          <Globe size={12} className="shrink-0 text-ink-faint" aria-hidden />
          <span className="truncate">{data.url}</span>
        </p>
        <p className="text-[11px] text-ink-faint">
          {data.status === 'requested'
            ? 'Capturing. This takes up to a minute.'
            : data.status === 'completed'
              ? 'Captured and sealed as an original.'
              : (data.failureReason ?? 'The capture failed.')}
        </p>
      </div>
    </li>
  )
}

function StateIcon({ state }: { state: Sending['state'] }) {
  if (state === 'sending')
    return (
      <LoaderCircle
        size={15}
        className="shrink-0 animate-spin text-cyan"
        aria-label="In progress"
      />
    )
  if (state === 'sealed')
    return <CheckCircle2 size={15} className="shrink-0 text-green" aria-label="Sealed" />
  return <CircleAlert size={15} className="shrink-0 text-red" aria-label="Failed" />
}
