import { Save } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { WallState } from '@/api/types'
import { Modal } from '@/components/Overlay'
import { Button, Field, inputClass } from '@/components/ui'
import { cn } from '@/lib/cn'
import { MiniWall } from './MiniWall'

/** Saves the layout as it is now as a named preset, stored by reporting for everyone (ADR 0015). */
export function SavePresetModal({
  open,
  onClose,
  state,
  saving,
  onSave,
}: {
  open: boolean
  onClose: () => void
  state: WallState
  saving: boolean
  onSave: (v: { name: string; description?: string }) => void
}) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const nameRef = useRef<HTMLInputElement>(null)
  // showModal() moves focus after mount, so autoFocus alone loses it.
  useEffect(() => {
    const t = setTimeout(() => nameRef.current?.focus(), 50)
    return () => clearTimeout(t)
  }, [])
  const valid = /[a-z0-9]/i.test(name) && name.trim().toLowerCase() !== 'custom'

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Save layout as preset"
      description="Saves the current layout, groups included, so any operator can activate it later."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            icon={Save}
            disabled={!valid || saving}
            onClick={() =>
              onSave({ name: name.trim(), description: description.trim() || undefined })
            }
          >
            {saving ? 'Saving…' : 'Save preset'}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-[150px_minmax(0,1fr)]">
        <MiniWall
          screens={state.screens.map((s) => s.content)}
          groups={state.groups}
          showIcons
          className="w-full self-start"
        />
        <div className="space-y-3">
          <Field label="Name" hint="Letters and digits; the first preset with a name wins.">
            <input
              ref={nameRef}
              value={name}
              maxLength={80}
              onChange={(e) => setName(e.target.value)}
              className={inputClass}
              placeholder="Night shift"
            />
          </Field>
          <Field label="Description">
            <textarea
              value={description}
              maxLength={300}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className={cn(inputClass, 'resize-none')}
              placeholder="When to use it"
            />
          </Field>
        </div>
      </div>
    </Modal>
  )
}
