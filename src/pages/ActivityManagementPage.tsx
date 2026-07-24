import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarRange, LoaderCircle, PencilLine, Plus, RefreshCw, Save } from 'lucide-react'
import { useMemo, useState, type FormEvent } from 'react'
import { EmptyState } from '../components/EmptyState'
import { ErrorBlock } from '../components/ErrorBlock'
import { LoadingBlock } from '../components/LoadingBlock'
import { FileUploadField } from '../components/FileUploadField'
import { apiJson, getApiBaseUrl } from '../lib/api'
import { formatDateTime, toDateTimeLocalValue } from '../lib/dateTime'
import { activityStatusClassMap, activityStatusTextMap } from '../lib/statusBadges'

type ActivityTypeItem = {
  id: string
  typeCode: string
  typeName: string
  aggregationMode: string
  metricUnit: string | null
}

type ActivityItem = {
  id: string
  name: string
  startAt: string
  endAt: string
  status: 'draft' | 'active' | 'ended' | 'disabled'
  description: string | null
  coverUrl: string | null
  createdAt: string
  updatedAt: string
  type: ActivityTypeItem
}

type ActivityTypesResponse = {
  items: ActivityTypeItem[]
}

type ActivitiesResponse = {
  items: ActivityItem[]
}

type ActivityMutationResponse = {
  item: ActivityItem
}

const activityTypesQueryKey = ['activity-types']
const activitiesQueryKey = ['activities']

export function ActivityManagementPage() {
  const queryClient = useQueryClient()
  const [editingActivityId, setEditingActivityId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [typeCode, setTypeCode] = useState('')
  const [startAt, setStartAt] = useState('')
  const [endAt, setEndAt] = useState('')
  const [description, setDescription] = useState('')
  const [coverUrl, setCoverUrl] = useState('')
  const [status] = useState<'draft'>('draft')
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editStartAt, setEditStartAt] = useState('')
  const [editEndAt, setEditEndAt] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editCoverUrl, setEditCoverUrl] = useState('')
  const [editStatus, setEditStatus] = useState<ActivityItem['status']>('draft')
  const [editError, setEditError] = useState<string | null>(null)
  const [editSuccess, setEditSuccess] = useState<string | null>(null)
  const [statusFeedback, setStatusFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [isUploadingCover, setIsUploadingCover] = useState(false)
  const [isEditingCoverUploading, setIsEditingCoverUploading] = useState(false)

  const activityTypesQuery = useQuery({
    queryKey: activityTypesQueryKey,
    queryFn: () => apiJson<ActivityTypesResponse>('/activities/types'),
  })

  const activitiesQuery = useQuery({
    queryKey: activitiesQueryKey,
    queryFn: () => apiJson<ActivitiesResponse>('/activities'),
  })

  const createMutation = useMutation({
    mutationFn: async (payload: {
      name: string
      typeCode: string
      startAt: string
      endAt: string
      description?: string
      coverUrl?: string
      status: 'draft' | 'active'
    }) =>
      apiJson<ActivityMutationResponse>('/activities', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    onSuccess: async () => {
      setName('')
      setTypeCode('')
      setStartAt('')
      setEndAt('')
      setDescription('')
      setSubmitSuccess('活动已创建为草稿，请继续到规则管理完成配置后再启用。')
      setSubmitError(null)
      setStatusFeedback(null)
      await queryClient.invalidateQueries({ queryKey: activitiesQueryKey })
    },
    onError: (error) => {
      setSubmitSuccess(null)
      setSubmitError(error instanceof Error ? error.message : '创建活动失败')
    },
  })

  const statusMutation = useMutation({
    mutationFn: async (payload: {
      activityId: string
      status: 'draft' | 'active' | 'ended' | 'disabled'
    }) =>
      apiJson<ActivityMutationResponse>(`/activities/${payload.activityId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: payload.status }),
      }),
    onSuccess: async () => {
      setStatusFeedback({
        type: 'success',
        message: '活动状态已更新。',
      })
      await queryClient.invalidateQueries({ queryKey: activitiesQueryKey })
    },
    onError: (error) => {
      setStatusFeedback({
        type: 'error',
        message: error instanceof Error ? error.message : '更新活动状态失败',
      })
    },
  })

  const updateMutation = useMutation({
    mutationFn: async (payload: {
      activityId: string
      name: string
      startAt: string
      endAt: string
      description?: string
      coverUrl?: string
      status: ActivityItem['status']
    }) => {
      const { activityId, ...body } = payload

      return apiJson<ActivityMutationResponse>(`/activities/${activityId}`, {
        method: 'PUT',
        body: JSON.stringify(body),
      })
    },
    onSuccess: async () => {
      setEditError(null)
      setEditSuccess('活动基础信息已更新')
      await queryClient.invalidateQueries({ queryKey: activitiesQueryKey })
    },
    onError: (error) => {
      setEditSuccess(null)
      setEditError(error instanceof Error ? error.message : '更新活动失败')
    },
  })

  const activeCount = useMemo(
    () => activitiesQuery.data?.items.filter((item) => item.status === 'active').length ?? 0,
    [activitiesQuery.data?.items],
  )

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitError(null)

    if (!name.trim()) {
      setSubmitError('请填写活动名称')
      return
    }

    if (!typeCode.trim()) {
      setSubmitError('请选择活动类型')
      return
    }

    if (!startAt || !endAt) {
      setSubmitError('请先填写开始时间与结束时间')
      return
    }

    const startDate = new Date(startAt)
    const endDate = new Date(endAt)

    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      setSubmitError('开始时间或结束时间格式不正确，请重新选择')
      return
    }

    if (endDate.getTime() <= startDate.getTime()) {
      setSubmitError('结束时间必须晚于开始时间')
      return
    }

    createMutation.mutate({
      name: name.trim(),
      typeCode: typeCode.trim(),
      startAt: startDate.toISOString(),
      endAt: endDate.toISOString(),
      description: description.trim() || undefined,
      coverUrl: coverUrl.trim() || undefined,
      status,
    })
  }

  function handleOpenEdit(item: ActivityItem) {
    if (editingActivityId === item.id) {
      setEditingActivityId(null)
      setEditError(null)
      setEditSuccess(null)
      return
    }

    setEditingActivityId(item.id)
    setEditName(item.name)
    setEditStartAt(toDateTimeLocalValue(item.startAt))
    setEditEndAt(toDateTimeLocalValue(item.endAt))
    setEditDescription(item.description ?? '')
    setEditCoverUrl(item.coverUrl ?? '')
    setEditStatus(item.status)
    setEditError(null)
    setEditSuccess(null)
  }

  function handleSaveEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!editingActivityId) {
      setEditError('请先选择要编辑的活动')
      return
    }

    setEditError(null)
    setEditSuccess(null)

    if (!editName.trim()) {
      setEditError('请填写活动名称')
      return
    }

    if (!editStartAt || !editEndAt) {
      setEditError('请先填写开始时间与结束时间')
      return
    }

    const startDate = new Date(editStartAt)
    const endDate = new Date(editEndAt)

    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      setEditError('开始时间或结束时间格式不正确，请重新选择')
      return
    }

    if (endDate.getTime() <= startDate.getTime()) {
      setEditError('结束时间必须晚于开始时间')
      return
    }

    updateMutation.mutate({
      activityId: editingActivityId,
      name: editName.trim(),
      startAt: startDate.toISOString(),
      endAt: endDate.toISOString(),
      description: editDescription.trim() || undefined,
      coverUrl: editCoverUrl.trim() || undefined,
      status: editStatus,
    })
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-soft">
        <div className="inline-flex items-center gap-2 rounded-full bg-brand-600/10 px-3 py-1 text-xs font-medium text-brand-700">
          <CalendarRange className="h-4 w-4" />
          活动管理
        </div>
        <h2 className="mt-4 text-2xl font-semibold tracking-tight text-slate-900">新建活动</h2>
        <p className="mt-3 text-sm leading-6 text-slate-500">
          先创建活动基础信息，再到规则管理配置活动项和奖励规则，完成后再启用。
        </p>

        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">活动名称</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="例如：七月礼物冲刺活动"
              className="mt-2 app-field"
            />
          </label>

          <div className="block">
            <FileUploadField
              label={isUploadingCover ? "正在上传封面，请稍候..." : "活动封面（建议16:9横版图片）"}
              accept="image/*"
              files={coverUrl ? [{ name: '已上传封面', lastModified: 0 } as any] : []}
              onChange={async (files) => {
                if (files.length > 0) {
                  setIsUploadingCover(true)
                  try {
                    const url = await uploadActivityCover(files[0])
                    setCoverUrl(url)
                  } catch (error) {
                    alert(error instanceof Error ? error.message : '上传失败')
                  } finally {
                    setIsUploadingCover(false)
                  }
                }
              }}
              onRemove={() => setCoverUrl('')}
            />
          </div>

          <label className="block">
            <span className="text-sm font-medium text-slate-700">活动类型</span>
            <select
              value={typeCode}
              onChange={(event) => setTypeCode(event.target.value)}
              className="mt-2 app-select"
              disabled={activityTypesQuery.isLoading || activityTypesQuery.isError}
            >
              <option value="">请选择活动类型</option>
              {activityTypesQuery.data?.items.map((item) => (
                <option key={item.id} value={item.typeCode}>
                  {item.typeName}
                </option>
              ))}
            </select>
          </label>

          {activityTypesQuery.isError ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600">
              {activityTypesQuery.error instanceof Error
                ? activityTypesQuery.error.message
                : '活动类型加载失败，请刷新后重试。'}
            </div>
          ) : null}

          <label className="block">
            <span className="text-sm font-medium text-slate-700">开始时间</span>
            <input
              type="datetime-local"
              value={startAt}
              onChange={(event) => setStartAt(event.target.value)}
              required
              className="mt-2 app-field"
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-slate-700">结束时间</span>
            <input
              type="datetime-local"
              value={endAt}
              onChange={(event) => setEndAt(event.target.value)}
              required
              className="mt-2 app-field"
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-slate-700">活动说明</span>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={4}
              placeholder="请输入活动简介，方便主播和运营老师快速理解活动要求。"
              className="mt-2 app-field"
            />
          </label>

          <div className="rounded-2xl border border-brand-100 bg-brand-50 px-4 py-3 text-sm text-brand-700">
            活动创建后会先保存为草稿，规则配置完成后再启用。
          </div>

          {submitError ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600">
              {submitError}
            </div>
          ) : null}

          {submitSuccess ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              {submitSuccess}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={createMutation.isPending || activityTypesQuery.isLoading || activityTypesQuery.isError || isUploadingCover}
            className="app-btn-primary w-full"
          >
            {createMutation.isPending || isUploadingCover ? (
              <>
                <LoaderCircle className="h-4 w-4 animate-spin" />
                {isUploadingCover ? '正在上传封面' : '正在保存'}
              </>
            ) : (
              <>
                <Plus className="h-4 w-4" />
                创建活动
              </>
            )}
          </button>
        </form>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-soft">
        <div className="flex flex-col gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-brand-600">当前活动概览</p>
            <h3 className="mt-1 text-2xl font-semibold text-slate-900">
              共 {activitiesQuery.data?.items.length ?? 0} 个活动，启用中 {activeCount} 个
            </h3>
          </div>
          <button
            type="button"
            onClick={() => void activitiesQuery.refetch()}
            className="app-btn-secondary"
          >
            <RefreshCw className="h-4 w-4" />
            刷新列表
          </button>
        </div>

        {statusFeedback ? (
          <div
            className={`mt-5 rounded-2xl px-4 py-3 text-sm ${
              statusFeedback.type === 'success'
                ? 'border border-emerald-200 bg-emerald-50 text-emerald-700'
                : 'border border-rose-200 bg-rose-50 text-rose-600'
            }`}
          >
            {statusFeedback.message}
          </div>
        ) : null}

        {activitiesQuery.isLoading ? (
          <LoadingBlock text="正在加载活动，请稍候..." minHeightClassName="min-h-64" />
        ) : activitiesQuery.isError ? (
          <ErrorBlock message={activitiesQuery.error instanceof Error ? activitiesQuery.error.message : '活动列表加载失败'} />
        ) : activitiesQuery.data && activitiesQuery.data.items.length > 0 ? (
          <div className="mt-6 space-y-4">
            {activitiesQuery.data.items.map((item) => (
              <article key={item.id} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm transition duration-300 hover:-translate-y-1 hover:shadow-md">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="flex items-start gap-4">
                    {item.coverUrl ? (
                      <img src={getApiBaseUrl().replace('/api', '') + item.coverUrl} alt="封面" className="h-20 w-32 rounded-xl object-cover border border-slate-200" />
                    ) : (
                      <div className="flex h-20 w-32 items-center justify-center rounded-xl bg-slate-100 text-xs text-slate-400 border border-slate-200">
                        无封面
                      </div>
                    )}
                    <div>
                      <div className="flex flex-wrap items-center gap-3">
                        <h4 className="text-lg font-semibold text-slate-900">{item.name}</h4>
                        <span className={activityStatusClassMap[item.status]}>
                          {activityStatusTextMap[item.status]}
                        </span>
                        <span className="rounded-full bg-slate-200 px-3 py-1 text-xs font-medium text-slate-600">
                          {item.type.typeName}
                        </span>
                      </div>
                      <p className="mt-2 text-sm text-slate-500">
                        时间范围：{formatDateTime(item.startAt)} - {formatDateTime(item.endAt)}
                      </p>
                      <p className="mt-1 text-sm text-slate-500">
                        统计方式：{formatAggregation(item.type.aggregationMode)}
                        {item.type.metricUnit ? ` | 单位：${item.type.metricUnit}` : ''}
                      </p>
                      <p className="mt-1 text-xs text-slate-400">
                        创建时间：{formatDateTime(item.createdAt)} | 更新时间：{formatDateTime(item.updatedAt)}
                      </p>
                      {item.description ? (
                        <p className="mt-3 rounded-2xl bg-white px-4 py-3 text-sm leading-6 text-slate-600">
                          {item.description}
                        </p>
                      ) : null}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => handleOpenEdit(item)}
                      className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition ${
                        editingActivityId === item.id
                          ? 'bg-brand-600 text-white shadow-soft'
                          : 'bg-transparent text-slate-600 hover:bg-brand-50 hover:text-brand-700'
                      }`}
                    >
                      <PencilLine className="h-4 w-4" />
                      {editingActivityId === item.id ? '收起编辑' : '编辑活动'}
                    </button>
                    {activityStatusOptions.map((nextStatus) => (
                      <button
                        key={nextStatus}
                        type="button"
                        disabled={statusMutation.isPending || nextStatus === item.status}
                        onClick={() =>
                          statusMutation.mutate({
                            activityId: item.id,
                            status: nextStatus,
                          })
                        }
                        className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
                          nextStatus === item.status
                            ? 'cursor-not-allowed bg-slate-100 text-brand-700'
                            : 'bg-transparent text-slate-600 hover:bg-brand-50 hover:text-brand-700'
                        }`}
                      >
                        {activityStatusTextMap[nextStatus]}
                      </button>
                    ))}
                  </div>
                </div>

                {editingActivityId === item.id ? (
                  <form
                    onSubmit={handleSaveEdit}
                    className="mt-5 grid gap-4 rounded-3xl border border-brand-100 bg-white p-5 lg:grid-cols-2"
                  >
                    <div className="lg:col-span-2">
                      <p className="text-sm font-medium text-brand-600">活动编辑</p>
                      <p className="mt-1 text-sm text-slate-500">
                        可修改活动名称、时间、说明和状态。活动类型不可修改，规则请到规则管理维护。
                      </p>
                    </div>

                    <label className="block">
                      <span className="text-sm font-medium text-slate-700">活动名称</span>
                      <input
                        value={editName}
                        onChange={(event) => setEditName(event.target.value)}
                        className="mt-2 app-field"
                      />
                    </label>

                    <div className="block lg:col-span-2">
                      <FileUploadField
                        label={isEditingCoverUploading ? "正在上传封面，请稍候..." : "活动封面（建议16:9横版图片）"}
                        accept="image/*"
                        files={editCoverUrl ? [{ name: '已上传封面', lastModified: 0 } as any] : []}
                        onChange={async (files) => {
                          if (files.length > 0) {
                            setIsEditingCoverUploading(true)
                            try {
                              const url = await uploadActivityCover(files[0])
                              setEditCoverUrl(url)
                            } catch (error) {
                              alert(error instanceof Error ? error.message : '上传失败')
                            } finally {
                              setIsEditingCoverUploading(false)
                            }
                          }
                        }}
                        onRemove={() => setEditCoverUrl('')}
                      />
                    </div>

                    <label className="block">
                      <span className="text-sm font-medium text-slate-700">活动类型</span>
                      <input
                        value={item.type.typeName}
                        disabled
                        className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500"
                      />
                    </label>

                    <label className="block">
                      <span className="text-sm font-medium text-slate-700">开始时间</span>
                      <input
                        type="datetime-local"
                        value={editStartAt}
                        onChange={(event) => setEditStartAt(event.target.value)}
                        className="mt-2 app-field"
                      />
                    </label>

                    <label className="block">
                      <span className="text-sm font-medium text-slate-700">结束时间</span>
                      <input
                        type="datetime-local"
                        value={editEndAt}
                        onChange={(event) => setEditEndAt(event.target.value)}
                        className="mt-2 app-field"
                      />
                    </label>

                    <label className="block lg:col-span-2">
                      <span className="text-sm font-medium text-slate-700">活动说明</span>
                      <textarea
                        value={editDescription}
                        onChange={(event) => setEditDescription(event.target.value)}
                        rows={4}
                        className="mt-2 app-field"
                      />
                    </label>

                    <label className="block">
                      <span className="text-sm font-medium text-slate-700">当前状态</span>
                      <select
                        value={editStatus}
                        onChange={(event) => setEditStatus(event.target.value as ActivityItem['status'])}
                        className="mt-2 app-select"
                      >
                        {activityStatusOptions.map((option) => (
                          <option key={option} value={option}>
                            {activityStatusTextMap[option]}
                          </option>
                        ))}
                      </select>
                    </label>

                    <div className="flex items-end justify-end lg:col-span-2">
                      <button
                        type="submit"
                        disabled={updateMutation.isPending || isEditingCoverUploading}
                        className="app-btn-primary"
                      >
                        {updateMutation.isPending || isEditingCoverUploading ? (
                          <>
                            <LoaderCircle className="h-4 w-4 animate-spin" />
                            {isEditingCoverUploading ? '正在上传封面' : '正在保存'}
                          </>
                        ) : (
                          <>
                            <Save className="h-4 w-4" />
                            保存修改
                          </>
                        )}
                      </button>
                    </div>

                    {editError ? (
                      <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600 lg:col-span-2">
                        {editError}
                      </div>
                    ) : null}

                    {editSuccess ? (
                      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 lg:col-span-2">
                        {editSuccess}
                      </div>
                    ) : null}
                  </form>
                ) : null}
              </article>
            ))}
          </div>
        ) : (
          <EmptyState
            title="当前暂无活动"
            description="先创建活动，再去规则管理配置活动项和奖励规则。"
          />
        )}
      </section>
    </div>
  )
}

const activityStatusOptions = ['draft', 'active', 'ended', 'disabled'] as const

function formatAggregation(value: string) {
  if (value === 'daily') {
    return '按天累计'
  }

  if (value === 'session') {
    return '按场次统计'
  }

  return value
}

async function uploadActivityCover(file: File) {
  const arrayBuffer = await file.arrayBuffer()
  const blob = new Blob([arrayBuffer], { type: file.type })

  const result = await apiJson<{ items: Array<{ fileUrl: string }> }>('/activities/upload-cover', {
    method: 'POST',
    body: JSON.stringify({
      fileName: file.name,
      mimeType: blob.type || file.type || 'image/png',
      base64Data: await blobToBase64(blob),
    }),
  })

  if (result.items && result.items.length > 0) {
    return result.items[0].fileUrl
  }
  throw new Error('未获取到图片地址')
}

async function blobToBase64(blob: Blob) {
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        reject(new Error('图片读取失败，请重新选择'))
        return
      }

      const commaIndex = reader.result.indexOf(',')
      resolve(commaIndex >= 0 ? reader.result.slice(commaIndex + 1) : reader.result)
    }

    reader.onerror = () => {
      reject(new Error('图片读取失败，请重新选择'))
    }

    reader.readAsDataURL(blob)
  })
}
