import { useCallback, useEffect, useState } from 'react'
import type { FamilyMemberApiDto, HealthEventApiDto, HealthEventStage } from '../types'
import { ApiRequestError } from '../services/apiClient'
import { familyMemberService } from '../services/familyMembers'
import { adaptFamilyMember } from '../services/healthEventDetailAdapter'
import { healthEventService } from '../services/healthEvents'
import { useAppStore } from '../store/useAppStore'
import { startIndependentRegionLoads } from './healthEventsListLoading'

export type RegionLoadState<T> =
  | { status: 'loading'; data?: T }
  | { status: 'success'; data: T }
  | { status: 'error'; data?: T; message: string }

interface HealthEventsListCache {
  token: string
  events?: HealthEventApiDto[]
  members?: FamilyMemberApiDto[]
}

let cache: HealthEventsListCache | null = null

function cachedData<T extends 'events' | 'members'>(token: string | null, key: T) {
  return token && cache?.token === token ? cache[key] : undefined
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback
}

export function useHealthEventsList() {
  const token = useAppStore((state) => state.authToken)
  const clearAuthSession = useAppStore((state) => state.clearAuthSession)
  const setMembers = useAppStore((state) => state.setMembers)
  const setCurrentMemberId = useAppStore((state) => state.setCurrentMemberId)
  const cachedEvents = cachedData(token, 'events')
  const cachedMembers = cachedData(token, 'members')
  const [eventsState, setEventsState] = useState<RegionLoadState<HealthEventApiDto[]>>(
    cachedEvents ? { status: 'success', data: cachedEvents } : { status: 'loading' }
  )
  const [membersState, setMembersState] = useState<RegionLoadState<FamilyMemberApiDto[]>>(
    cachedMembers ? { status: 'success', data: cachedMembers } : { status: 'loading' }
  )

  const handleUnauthorized = useCallback((error: unknown) => {
    if (error instanceof ApiRequestError && error.status === 401) {
      cache = null
      clearAuthSession()
      return true
    }
    return false
  }, [clearAuthSession])

  const loadMembers = useCallback(async (signal?: AbortSignal) => {
    if (!token) return
    const previous = cachedData(token, 'members')
    setMembersState(previous ? { status: 'loading', data: previous } : { status: 'loading' })
    try {
      const memberDtos = await familyMemberService.list(token, signal)
      if (signal?.aborted) return
      const adaptedMembers = memberDtos.map(adaptFamilyMember)
      setMembers(adaptedMembers)
      const currentId = useAppStore.getState().currentMemberId
      if (!adaptedMembers.some((member) => member.id === currentId) && adaptedMembers[0]) {
        setCurrentMemberId(adaptedMembers[0].id)
      }
      cache = { ...(cache?.token === token ? cache : { token }), members: memberDtos }
      setMembersState({ status: 'success', data: memberDtos })
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      if (handleUnauthorized(error)) return
      setMembersState({
        status: 'error',
        ...(previous ? { data: previous } : {}),
        message: errorMessage(error, '家庭成员加载失败，请重试')
      })
    }
  }, [handleUnauthorized, setCurrentMemberId, setMembers, token])

  const loadEvents = useCallback(async (signal?: AbortSignal) => {
    if (!token) return
    const previous = cachedData(token, 'events')
    setEventsState(previous ? { status: 'loading', data: previous } : { status: 'loading' })
    try {
      const events = await healthEventService.list(token, signal)
      if (signal?.aborted) return
      cache = { ...(cache?.token === token ? cache : { token }), events }
      setEventsState({ status: 'success', data: events })
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      if (handleUnauthorized(error)) return
      setEventsState({
        status: 'error',
        ...(previous ? { data: previous } : {}),
        message: errorMessage(error, '健康事件加载失败，请重试')
      })
    }
  }, [handleUnauthorized, token])

  useEffect(() => {
    const membersController = new AbortController()
    const eventsController = new AbortController()
    const loads = startIndependentRegionLoads(
      () => loadMembers(membersController.signal),
      () => loadEvents(eventsController.signal)
    )
    void loads.members
    void loads.events
    return () => {
      membersController.abort()
      eventsController.abort()
    }
  }, [loadEvents, loadMembers])

  const updateEventStatus = useCallback(async (eventId: string, status: HealthEventStage) => {
    if (!token) throw new Error('登录状态已失效')
    const updated = await healthEventService.updateStatus(eventId, status, token)
    setEventsState((current) => {
      if (!current.data) return current
      const events = current.data.map((event) => event.id === eventId ? updated : event)
      cache = { ...(cache?.token === token ? cache : { token }), events }
      return { status: 'success', data: events }
    })
  }, [token])

  const deleteEvent = useCallback(async (eventId: string) => {
    if (!token) throw new Error('登录状态已失效')
    await healthEventService.delete(eventId, token)
    setEventsState((current) => {
      if (!current.data) return current
      const events = current.data.filter((event) => event.id !== eventId)
      cache = { ...(cache?.token === token ? cache : { token }), events }
      return { status: 'success', data: events }
    })
  }, [token])

  return {
    eventsState,
    membersState,
    retryEvents: () => void loadEvents(),
    retryMembers: () => void loadMembers(),
    updateEventStatus,
    deleteEvent
  }
}
