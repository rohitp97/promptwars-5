import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Progress } from '../components/Chrome'

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('Progress', () => {
  it('shows the message in a polite live region with the normal reassurance', () => {
    render(<Progress message="Reading your notice…" />)
    const region = screen.getByRole('status')
    expect(region).toHaveAttribute('aria-live', 'polite')
    expect(region).toHaveTextContent('Reading your notice…')
    expect(region).toHaveTextContent('usually takes 10–30 seconds')
  })

  it('stays reassuring up to 19 seconds', () => {
    render(<Progress message="Working…" />)
    act(() => {
      vi.advanceTimersByTime(19_000)
    })
    expect(screen.getByRole('status')).toHaveTextContent('usually takes 10–30 seconds')
    expect(screen.getByRole('status')).not.toHaveTextContent('Still working')
  })

  it('admits it is slow from 20 seconds, without claiming anything is lost or saved', () => {
    render(<Progress message="Working…" />)
    act(() => {
      vi.advanceTimersByTime(20_000)
    })
    const region = screen.getByRole('status')
    expect(region).toHaveTextContent('Still working')
    expect(region).toHaveTextContent('AI service is busy')
    expect(region).toHaveTextContent('nothing is being saved')
    expect(region).not.toHaveTextContent('usually takes 10–30 seconds')
    expect(region).toHaveTextContent('Working…')
  })

  it('stops its timer when it goes away', () => {
    const { unmount } = render(<Progress message="Working…" />)
    expect(vi.getTimerCount()).toBe(1)
    unmount()
    expect(vi.getTimerCount()).toBe(0)
  })
})
