import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AuditActivationPage } from './AuditActivationPage'

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <AuditActivationPage />
    </QueryClientProvider>,
  )
}

describe('AuditActivationPage', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('creates a task with an assigned operator and no device time', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (input, init) => {
        const url = String(input)
        if (url === '/api/staff/operators/active') {
          return new Response(
            JSON.stringify({
              items: [{ id: 'operator-1', displayName: '运营A' }],
            }),
            {
              status: 200,
              headers: { 'content-type': 'application/json' },
            },
          )
        }
        if (url === '/api/activation-tasks' && init?.method === 'POST') {
          return new Response(JSON.stringify({ item: { id: 'task-1' } }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          })
        }
        return new Response(JSON.stringify({ items: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      })

    renderPage()

    expect(screen.queryByLabelText('设备调试完成时间')).toBeNull()
    fireEvent.change(screen.getByLabelText('主播昵称'), {
      target: { value: '主播小鹿' },
    })
    fireEvent.change(screen.getByLabelText('企微UID'), {
      target: { value: 'anchor-uid' },
    })
    await screen.findByRole('option', { name: '运营A' })
    fireEvent.change(screen.getByLabelText('分配运营'), {
      target: { value: 'operator-1' },
    })
    fireEvent.change(screen.getByLabelText('入会时间'), {
      target: { value: '2026-07-23T09:00' },
    })
    fireEvent.click(
      screen.getByRole('button', { name: '创建档案开通任务' }),
    )

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/activation-tasks',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"operatorId":"operator-1"'),
        }),
      )
    })
  })
})
