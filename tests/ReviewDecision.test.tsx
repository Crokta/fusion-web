import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { ReviewItem } from '@/api/types'
import { ReviewDecisionPanel } from '@/features/review/ReviewDecision'

const item: ReviewItem = {
  caseId: 'inv-0263',
  caseRef: 'INV-0263',
  title: 'Viral video verification',
  authorId: 'u-author',
  authorName: 'Author Person',
  submittedAt: new Date().toISOString(),
  dueAt: new Date(Date.now() + 3600_000).toISOString(),
  findingCount: 3,
  evidenceCount: 5,
  priority: 'high',
  marking: 'OFFICIAL-SENSITIVE',
  revision: 1,
}

describe('ReviewDecisionPanel', () => {
  it('blocks the author from deciding their own case', () => {
    const onDecide = vi.fn()
    render(
      <ReviewDecisionPanel
        item={item}
        currentUserId="u-author"
        activeRole="reviewer"
        onDecide={onDecide}
      />,
    )
    expect(screen.getByText(/another reviewer must decide/i)).toBeInTheDocument()
    expect(screen.getByText('self_approval_forbidden')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /approve/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /return to analyst/i })).toBeDisabled()
  })

  it('blocks roles that cannot decide reviews', () => {
    render(
      <ReviewDecisionPanel
        item={item}
        currentUserId="u-other"
        activeRole="analyst"
        onDecide={vi.fn()}
      />,
    )
    expect(screen.getByRole('button', { name: /approve/i })).toBeDisabled()
    expect(screen.getByText(/switch to reviewer/i)).toBeInTheDocument()
  })

  it('lets a different reviewer approve', async () => {
    const onDecide = vi.fn()
    render(
      <ReviewDecisionPanel
        item={item}
        currentUserId="u-other"
        activeRole="reviewer"
        onDecide={onDecide}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: /approve/i }))
    expect(onDecide).toHaveBeenCalledWith('approve', '')
  })

  it('requires a comment to return a case', async () => {
    const onDecide = vi.fn()
    render(
      <ReviewDecisionPanel
        item={item}
        currentUserId="u-other"
        activeRole="supervisor"
        onDecide={onDecide}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: /return to analyst/i }))
    expect(onDecide).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent(/comment is required/i)
    await userEvent.type(
      screen.getByLabelText(/reviewer comment/i),
      'Geolocation needs a second source',
    )
    await userEvent.click(screen.getByRole('button', { name: /return to analyst/i }))
    expect(onDecide).toHaveBeenCalledWith('return', 'Geolocation needs a second source')
  })
})
