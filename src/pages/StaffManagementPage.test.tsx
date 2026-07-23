import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { StaffManagementPage } from './StaffManagementPage'

const staff = {
  id: 'staff-1',
  displayName: '测试老师',
  wecomUserId: 'wecom-user-1',
  roles: ['operator'],
  status: 'active',
  createdAt: '2026-07-23T00:00:00.000Z',
  updatedAt: '2026-07-23T00:00:00.000Z',
}

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <StaffManagementPage />
    </QueryClientProvider>,
  )
}

describe('StaffManagementPage', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('edits an existing employee roles through an explicit save flow', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ items: [staff] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            item: {
              ...staff,
              roles: ['operator', 'training_teacher'],
            },
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            items: [
              {
                ...staff,
                roles: ['operator', 'training_teacher'],
              },
            ],
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          },
        ),
      )

    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: '编辑角色' }))
    const editor = screen.getByText('勾选该员工需要使用的全部角色').parentElement
    if (!editor) {
      throw new Error('未找到角色编辑区域')
    }
    fireEvent.click(within(editor).getByRole('checkbox', { name: '培训老师' }))
    fireEvent.click(screen.getByRole('button', { name: '保存角色' }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/staff/staff-1/roles',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({
            roles: ['operator', 'training_teacher'],
          }),
        }),
      )
    })

    expect(await screen.findByText(/角色已保存/)).toBeTruthy()
  })
})
