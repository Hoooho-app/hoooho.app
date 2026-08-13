import { useCallback, useEffect, useState } from 'react'
import type { FamilyMemberApiDto, HealthEventListItemViewModel, HealthEventStage, Member } from '../types'
import { ApiRequestError } from '../services/apiClient'
import { familyMemberService } from '../services/familyMembers'
import { adaptFamilyMember } from '../services/healthEventDetailAdapter'
import { adaptHealthEventList } from '../services/healthEventListAdapter'
import { healthEventRecordService } from '../services/healthEventRecords'
import { healthEventService } from '../services/healthEvents'
import { eventAttachmentService } from '../services/eventAttachments'
import { useAppStore } from '../store/useAppStore'

interface LoadedHealthEvents {
  events: HealthEventListItemViewModel[]
  memberDtos: FamilyMemberApiDto[]
  members: Member[]
}

type HealthEventsListState =
  | { status: 'loading' }
  | { status: 'success'; data: LoadedHealthEvents }
  | { status: 'error'; message: string }

export function useHealthEventsList() {
  const token = useAppStore((state) => state.authToken)
  const clearAuthSession = useAppStore((state) => state.clearAuthSession)
  const setMembers = useAppStore((state) => state.setMembers)
  const setCurrentMemberId = useAppStore((state) => state.setCurrentMemberId)
  const [state, setState] = useState<HealthEventsListState>({ status: 'loading' })

  const load = useCallback(async (signal?: AbortSignal) => {
    if (!token) return
    setState({ status: 'loading' })
    try {
      const [eventDtos, memberDtos] = await Promise.all([
        healthEventService.list(token, signal),
        familyMemberService.list(token, signal)
      ])
      const [recordEntries, attachmentEntries] = await Promise.all([
        Promise.all(eventDtos.map(async (event) => (
          [event.id, await healthEventRecordService.list(event.id, token, signal)] as const
        ))),
        Promise.all(eventDtos.map(async (event) => (
          [event.id, await eventAttachmentService.list(event.id, token, signal)] as const
        )))
      ])
      if (signal?.aborted) return
      const recordsByEventId = new Map(recordEntries)
      const attachmentsByEventId = new Map(attachmentEntries)
      const adaptedMembers = memberDtos.map(adaptFamilyMember)
      setMembers(adaptedMembers)
      const currentId = useAppStore.getState().currentMemberId
      if (!adaptedMembers.some((member) => member.id === currentId) && adaptedMembers[0]) {
        setCurrentMemberId(adaptedMembers[0].id)
      }
      setState({
        status: 'success',
        data: {
          events: adaptHealthEventList(eventDtos, memberDtos, recordsByEventId, attachmentsByEventId),
          memberDtos,
          members: adaptedMembers
        }
      })
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      if (error instanceof ApiRequestError && error.status === 401) {
        clearAuthSession()
        return
      }
      setState({
        status: 'error',
        message: error instanceof Error ? error.message : '健康事件加载失败，请稍后重试'
      })
    }
  }, [clearAuthSession, setCurrentMemberId, setMembers, token])

  useEffect(() => {
    const controller = new AbortController()
    void load(controller.signal)
    return () => controller.abort()
  }, [load])

  const updateEventStatus = useCallback(async (eventId: string, status: HealthEventStage) => {
    if (!token) throw new Error('登录状态已失效')
    const updated = await healthEventService.updateStatus(eventId, status, token)
    setState((current) => current.status === 'success'
      ? {
          status: 'success',
          data: {
            ...current.data,
            events: current.data.events.map((event) => event.id === eventId
              ? { ...event, status: updated.status, updatedAt: updated.updatedAt }
              : event)
          }
        }
      : current)
  }, [token])

  const deleteEvent = useCallback(async (eventId: string) => {
    if (!token) throw new Error('登录状态已失效')
    await healthEventService.delete(eventId, token)
    setState((current) => current.status === 'success'
      ? {
          status: 'success',
          data: {
            ...current.data,
            events: current.data.events.filter((event) => event.id !== eventId)
          }
        }
      : current)
  }, [token])

  return { state, retry: () => void load(), updateEventStatus, deleteEvent }
}
