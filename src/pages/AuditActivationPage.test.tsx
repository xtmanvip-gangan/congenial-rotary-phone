import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'
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

  it('shows a validation message instead of throwing when preparation times are empty', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ items: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )

    renderPage()

    fireEvent.change(screen.getByLabelText('企微展示名'), {
      target: { value: '测试主播' },
    })
    fireEvent.change(screen.getByLabelText('企微UID'), {
      target: { value: 'anchor-test-uid' },
    })
    fireEvent.click(screen.getByRole('button', { name: '创建激活任务' }))

    expect(
      await screen.findByText('请填写入会完成时间和设备调试完成时间'),
    ).toBeTruthy()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
