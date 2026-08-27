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
    setState((current) => current.status === 'loading' ? current : { status: 'loading' })
    try {
      const eventDto = await healthEventService.getById(eventId, token, signal)
      const [records, memberDto, organizations] = await Promise.all([
        healthEventRecordService.list(eventId, token, signal),
        familyMemberService.getById(eventDto.memberId, token, signal),
        healthRecordOrganizationService.list(eventId, token, signal)
      ])
      if (signal?.aborted) return
      setState({
        status: 'success',
        data: {
          eventDto,
          memberDto,
          records,
          organizations,
          attachments: [],
          member: adaptFamilyMember(memberDto),
          viewModel: adaptHealthEventDetail(eventDto, records, organizations, [])
        }
      })
      try {
        const loadedAttachments = await eventAttachmentService.list(eventId, token, signal)
        if (signal?.aborted) return
        setState((current) => {
          if (current.status !== 'success' || current.data.eventDto.id !== eventDto.id) return current
          const loadedIds = new Set(loadedAttachments.map(({ id }) => id))
          const attachments = [
            ...loadedAttachments,
            ...current.data.attachments.filter(({ id }) => !loadedIds.has(id))
          ]
          return {
            status: 'success',
            data: {
              ...current.data,
              attachments,
              viewModel: adaptHealthEventDetail(
                current.data.eventDto,
                current.data.records,
                current.data.organizations,
                attachments
              )
            }
          }
        })
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return
        if (error instanceof ApiRequestError && error.status === 401) clearAuthSession()
        else console.warn('[Hoooho] attachment list did not load', error)
      }
    } catch (error) {
      handleRequestError(error)
    }
  }, [clearAuthSession, eventId, handleRequestError, token])

  useEffect(() => {
    const controller = new AbortController()
    void load(controller.signal)
    return () => controller.abort()
  }, [load])

  const commitRecord = useCallback((record: HealthEventRecordApiDto) => {
    setState((current) => {
      if (current.status !== 'success' || current.data.records.some(({ id }) => id === record.id)) return current
      const records = [...current.data.records, record]
      return {
        status: 'success',
        data: {
          ...current.data,
          records,
          viewModel: adaptHealthEventDetail(current.data.eventDto, records, current.data.organizations, current.data.attachments)
        }
      }
    })
  }, [])

  const addRecord = useCallback(async (input: CreateHealthEventRecordInput, options?: { deferCommit?: boolean }) => {
    if (!eventId || !token) throw new Error('登录状态或健康事件无效')
    const created = await healthEventRecordService.create(eventId, input, token)
    if (!options?.deferCommit) commitRecord(created)
    return created
  }, [commitRecord, eventId, token])

  const previewRecord = useCallback(async (rawInput: string, options?: { bodyLocations?: string[]; selectedOccurredAt?: string }) => {
    if (!eventId || !token) throw new Error('登录状态或健康事件无效')
    return healthRecordOrganizationService.preview(eventId, rawInput, token, options)
  }, [eventId, token])

  const organizeRecord = useCallback(async (recordId: string, context?: string) => {
    if (!eventId || !token) throw new Error('登录状态或健康事件无效')
    const organization = await healthRecordOrganizationService.organize(eventId, recordId, token, context)
    const refreshedEvent = await healthEventService.getById(eventId, token)
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
          eventDto: refreshedEvent,
          organizations,
          viewModel: adaptHealthEventDetail(refreshedEvent, current.data.records, organizations, current.data.attachments)
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

  const correctSummary = useCallback(async (input: { title: string; summary: string }) => {
    if (!eventId || !token) throw new Error('登录状态或健康事件无效')
    const updatedEvent = await healthEventService.correctSummary(eventId, input, token)
    setState((current) => current.status === 'success'
      ? {
          status: 'success',
          data: {
            ...current.data,
            eventDto: updatedEvent,
            viewModel: adaptHealthEventDetail(updatedEvent, current.data.records, current.data.organizations, current.data.attachments)
          }
        }
      : current)
    return updatedEvent
  }, [eventId, token])

  const retry = useCallback(() => {
    void load()
  }, [load])

  return { state, addRecord, commitRecord, previewRecord, addAttachment, organizeRecord, updateStage, updateTitle, correctSummary, retry }
}
