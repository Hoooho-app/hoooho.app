import { useCallback, useEffect, useRef, useState } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { careApi, announceCareTheme, type CareDashboard } from './api';
export function useCareJourney() {
    const token = useAppStore(s => s.authToken), accountId = useAppStore(s => s.authUser?.id ?? ''), memberId = useAppStore(s => s.currentMemberId);
    const [data, setData] = useState<CareDashboard | null>(null), [loading, setLoading] = useState(true), [error, setError] = useState(''), [busy, setBusy] = useState(''), [levelUp, setLevelUp] = useState(false);
    const sequence = useRef(0), scope = useRef(accountId), mounted = useRef(true), busyRef = useRef(false);
    scope.current = accountId;
    const accept = useCallback((next: CareDashboard) => {
        if (!mounted.current || scope.current !== accountId)
            return;
        let previous = next.level.value;
        try {
            const key = `hoooho:care-last-level:${accountId}`;
            previous = Number(sessionStorage.getItem(key) ?? next.level.value);
            sessionStorage.setItem(key, String(next.level.value));
        }
        catch { /* Optional presentation memory only. */ }
        setLevelUp(current => current || next.level.value > previous);
        setData(next);
        announceCareTheme(next.theme.active);
    }, [accountId]);
    const refresh = useCallback(async (quiet = false) => {
        const id = ++sequence.current;
        if (!token) {
            setLoading(false);
            setData(null);
            setError('请登录后查看呵护之旅');
            return;
        }
        if (!quiet)
            setLoading(true);
        try {
            const next = await careApi.dashboard(token);
            if (mounted.current && id === sequence.current && scope.current === accountId) {
                accept(next);
                setError('');
            }
        }
        catch (cause) {
            if (mounted.current && id === sequence.current && scope.current === accountId)
                setError(cause instanceof Error ? cause.message : '暂时无法读取，请重试');
        }
        finally {
            if (mounted.current && id === sequence.current)
                setLoading(false);
        }
    }, [token, accountId, memberId, accept]);
    useEffect(() => { mounted.current = true; setData(null); setLevelUp(false); void refresh(); const onFocus = () => { if (document.visibilityState === 'visible')
        void refresh(true); }; window.addEventListener('focus', onFocus); document.addEventListener('visibilitychange', onFocus); return () => { mounted.current = false; sequence.current++; window.removeEventListener('focus', onFocus); document.removeEventListener('visibilitychange', onFocus); }; }, [refresh]);
    const mutate = useCallback(async (label: string, operation: (token: string) => Promise<CareDashboard>) => {
        if (!token || busyRef.current)
            return null;
        busyRef.current = true;
        setBusy(label);
        setError('');
        const mutationScope = accountId;
        try {
            const next = await operation(token);
            if (mounted.current && scope.current === mutationScope) {
                accept(next);
                return next;
            }
            return null;
        }
        catch (cause) {
            if (mounted.current && scope.current === mutationScope)
                setError(cause instanceof Error ? cause.message : '本次操作未确认，请重试');
            return null;
        }
        finally {
            busyRef.current = false;
            if (mounted.current)
                setBusy('');
        }
    }, [token, accountId, accept]);
    return { data, loading, error, busy, levelUp, refresh, mutate, token };
}
