import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { StateStepper, stepIndex } from '@/components/StateStepper'

describe('StateStepper', () => {
  it('marks earlier steps done and the current step active', () => {
    render(<StateStepper state="in_assessment" />)
    const steps = screen.getAllByRole('listitem')
    expect(steps).toHaveLength(7)
    expect(steps[0]).toHaveAttribute('data-state', 'done')
    expect(steps[1]).toHaveAttribute('data-state', 'done')
    expect(steps[2]).toHaveAttribute('data-state', 'current')
    expect(steps[2]).toHaveAttribute('aria-current', 'step')
    expect(steps[3]).toHaveAttribute('data-state', 'upcoming')
  })

  it('draws Returned as a branch at the decision slot', () => {
    render(<StateStepper state="returned" />)
    const steps = screen.getAllByRole('listitem')
    expect(steps[4]).toHaveAttribute('data-state', 'returned')
    expect(steps[4]).toHaveTextContent('Returned')
    expect(steps[3]).toHaveAttribute('data-state', 'done')
  })

  it('places every state on the line', () => {
    expect(stepIndex('triage')).toBe(0)
    expect(stepIndex('approved')).toBe(4)
    expect(stepIndex('returned')).toBe(4)
    expect(stepIndex('closed')).toBe(6)
  })
})
