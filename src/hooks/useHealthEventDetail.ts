import { useCallback, useEffect, useState } from 'react'
import type {
  CreateHealthEventRecordInput,
  FamilyMemberApiDto,
  HealthEventApiDto,
  HealthEventDetailViewModel,
  HealthEventRecordApiDto,
  Member
} from '../types'
import { ApiRequestError } from '../services/apiClient'
import { familyMemberService } from '../services/familyMembers'
import { adaptFamilyMember, adaptHealthEventDetail } from '../services/healthEventDetailAdapter'
import { healthEventRecordService } from '../services/healthEventRecords'
import { healthEventService } from '../services/healthEvents'
import { useAppStore } from '../store/useAppStore'

interface LoadedDetailData {
  eventDto: HealthEventApiDto
  memberDto: FamilyMemberApiDto
  records: HealthEventRecordApiDto[]
  member: Member
  viewModel: HealthEventDetailViewModel
}

type HealthEventDetailState =
  | { status: 'loading' }
  | { status: 'success'; data: LoadedDetailData }
  | { status: 'not-found' }
  | { status: 'error'; message: string }

export function useHealthEventDetail(eventId: string | undefined) {
  const token = useAppStore((state) => state.authToken)
  const clearAuthSession = useAppStore((state) => state.clearAuthSession)
  const [state, setState] = useState<HealthEventDetailState>({ status: 'loading' })

  const handleRequestError = useCallback((error: unknown) => {
    if (error instanceof DOMException && error.name === 'AbortError') return
    if (error instanceof ApiRequestError && error.status === 401) {
      clearAuthSession()
      return
    }
    if (error instanceof ApiRequestError && error.status === 404) {
      setState({ status: 'not-found' })
      return
    }
    setState({ status: 'error', message: error instanceof Error ? error.message : '健康事件加载失败，请稍后重试' })
  }, [clearAuthSession])

  const load = useCallback(async (signal?: AbortSignal) => {
    if (!eventId || !token) return
    setState({ status: 'loading' })
    try {
      const eventDto = await healthEventService.getById(eventId, token, signal)
      const [records, memberDto] = await Promise.all([
        healthEventRecordService.list(eventId, token, signal),
        familyMemberService.getById(eventDto.memberId, token, signal)
      ])
      if (signal?.aborted) return
      setState({
        status: 'success',
        data: {
          eventDto,
          memberDto,
          records,
          member: adaptFamilyMember(memberDto),
          viewModel: adaptHealthEventDetail(eventDto, records)
        }
      })
    } catch (error) {
      handleRequestError(error)
    }
  }, [eventId, handleRequestError, token])

  useEffect(() => {
    const controller = new AbortController()
    void load(controller.signal)
    return () => controller.abort()
  }, [load])

  const addRecord = useCallback(async (input: CreateHealthEventRecordInput) => {
    if (!eventId || !token) throw new Error('登录状态或健康事件无效')
    const created = await healthEventRecordService.create(eventId, input, token)
    setState((current) => {
      if (current.status !== 'success') return current
      const records = [...current.data.records, created]
      return {
        status: 'success',
        data: {
          ...current.data,
          records,
          viewModel: adaptHealthEventDetail(current.data.eventDto, records)
        }
      }
    })
    return created
  }, [eventId, token])

  const updateStage = useCallback(async (stage: HealthEventApiDto['status']) => {
    if (!eventId || !token) throw new Error('登录状态或健康事件无效')
    const updatedEvent = await healthEventService.updateStatus(eventId, stage, token)
    setState((current) => {
      if (current.status !== 'success') return current
      return {
        status: 'success',
        data: {
          ...current.data,
          eventDto: updatedEvent,
          viewModel: adaptHealthEventDetail(updatedEvent, current.data.records)
        }
      }
    })
    return updatedEvent
  }, [eventId, token])

  const updateTitle = useCallback(async (title: string) => {
    if (!eventId || !token) throw new Error('登录状态或健康事件无效')
    const updatedEvent = await healthEventService.updateTitle(eventId, title, token)
    setState((current) => {
      if (current.status !== 'success') return current
      return {
        status: 'success',
        data: {
          ...current.data,
          eventDto: updatedEvent,
          viewModel: adaptHealthEventDetail(updatedEvent, current.data.records)
        }
      }
    })
    return updatedEvent
  }, [eventId, token])

  const retry = useCallback(() => {
    void load()
  }, [load])

  return { state, addRecord, updateStage, updateTitle, retry }
}
