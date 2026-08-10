import { useCallback, useEffect, useState } from 'react'
import type {
  CreateHealthEventRecordInput,
  CreateEventAttachmentInput,
  EventAttachmentApiDto,
  FamilyMemberApiDto,
  HealthEventApiDto,
  HealthEventDetailViewModel,
  HealthEventRecordApiDto,
  HealthRecordOrganizationApiDto,
  Member
} from '../types'
import { ApiRequestError } from '../services/apiClient'
import { familyMemberService } from '../services/familyMembers'
import { adaptFamilyMember, adaptHealthEventDetail } from '../services/healthEventDetailAdapter'
import { healthEventRecordService } from '../services/healthEventRecords'
import { healthEventService } from '../services/healthEvents'
import { healthRecordOrganizationService } from '../services/healthRecordOrganization'
import { eventAttachmentService } from '../services/eventAttachments'
import { useAppStore } from '../store/useAppStore'

interface LoadedDetailData {
  eventDto: HealthEventApiDto
  memberDto: FamilyMemberApiDto
  records: HealthEventRecordApiDto[]
  organizations: HealthRecordOrganizationApiDto[]
  attachments: EventAttachmentApiDto[]
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
      const [records, memberDto, organizations, attachments] = await Promise.all([
        healthEventRecordService.list(eventId, token, signal),
        familyMemberService.getById(eventDto.memberId, token, signal),
        healthRecordOrganizationService.list(eventId, token, signal),
        eventAttachmentService.list(eventId, token, signal)
      ])
      if (signal?.aborted) return
      setState({
        status: 'success',
        data: {
          eventDto,
          memberDto,
          records,
          organizations,
          attachments,
          member: adaptFamilyMember(memberDto),
          viewModel: adaptHealthEventDetail(eventDto, records, organizations, attachments)
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
          viewModel: adaptHealthEventDetail(current.data.eventDto, records, current.data.organizations, current.data.attachments)
        }
      }
    })
    return created
  }, [eventId, token])

  const previewRecord = useCallback(async (rawInput: string) => {
    if (!eventId || !token) throw new Error('登录状态或健康事件无效')
    return healthRecordOrganizationService.preview(eventId, rawInput, token)
  }, [eventId, token])

  const organizeRecord = useCallback(async (recordId: string) => {
    if (!eventId || !token) throw new Error('登录状态或健康事件无效')
    const organization = await healthRecordOrganizationService.organize(eventId, recordId, token)
    setState((current) => {
      if (current.status !== 'success') return current
      const organizations = [
        ...current.data.organizations.filter((item) => item.recordId !== organization.recordId),
        organization
      ]
      return {
        status: 'success',
        data: {
          ...current.data,
          organizations,
          viewModel: adaptHealthEventDetail(current.data.eventDto, current.data.records, organizations, current.data.attachments)
        }
      }
    })
    return organization
  }, [eventId, token])

  const addAttachment = useCallback(async (input: CreateEventAttachmentInput) => {
    if (!eventId || !token) throw new Error('登录状态或健康事件无效')
    const attachment = await eventAttachmentService.create(eventId, input, token)
    setState((current) => {
      if (current.status !== 'success') return current
      const attachments = [...current.data.attachments, attachment]
      return {
        status: 'success',
        data: {
          ...current.data,
          attachments,
          viewModel: adaptHealthEventDetail(current.data.eventDto, current.data.records, current.data.organizations, attachments)
        }
      }
    })
    return attachment
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
          viewModel: adaptHealthEventDetail(updatedEvent, current.data.records, current.data.organizations, current.data.attachments)
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
          viewModel: adaptHealthEventDetail(updatedEvent, current.data.records, current.data.organizations, current.data.attachments)
        }
      }
    })
    return updatedEvent
  }, [eventId, token])

  const retry = useCallback(() => {
    void load()
  }, [load])

  return { state, addRecord, previewRecord, addAttachment, organizeRecord, updateStage, updateTitle, retry }
}
