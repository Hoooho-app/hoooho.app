export type IdleIndex = 0 | 1;
export type IdlePlayer = 0 | 1;

export interface IdlePlaylistState {
  activeIdleIndex: IdleIndex;
  nextIdleIndex: IdleIndex;
  activePlayer: IdlePlayer;
  pendingPlayer: IdlePlayer | null;
  playbackSessionId: number;
  hasPlayed: boolean;
  suspended: boolean;
}

export function otherIdleIndex(index: IdleIndex): IdleIndex {
  return index === 0 ? 1 : 0;
}

export function createIdlePlaylistState(): IdlePlaylistState {
  return {
    activeIdleIndex: 0,
    nextIdleIndex: 1,
    activePlayer: 0,
    pendingPlayer: null,
    playbackSessionId: 0,
    hasPlayed: false,
    suspended: true,
  };
}

export function beginIdlePlayback(
  state: IdlePlaylistState,
  player: IdlePlayer,
): IdlePlaylistState {
  return {
    ...state,
    pendingPlayer: player,
    playbackSessionId: state.playbackSessionId + 1,
    suspended: false,
  };
}

export function commitIdlePlayback(
  state: IdlePlaylistState,
  player: IdlePlayer,
  playbackSessionId: number,
): IdlePlaylistState {
  if (
    state.suspended ||
    state.pendingPlayer !== player ||
    state.playbackSessionId !== playbackSessionId
  ) {
    return state;
  }

  return {
    ...state,
    activeIdleIndex: player,
    nextIdleIndex: otherIdleIndex(player),
    activePlayer: player,
    pendingPlayer: null,
    hasPlayed: true,
  };
}

export function requestNextIdlePlayback(
  state: IdlePlaylistState,
  player: IdlePlayer,
  playbackSessionId: number,
): IdlePlaylistState {
  if (
    state.suspended ||
    !state.hasPlayed ||
    state.pendingPlayer !== null ||
    state.activePlayer !== player ||
    state.playbackSessionId !== playbackSessionId
  ) {
    return state;
  }

  return beginIdlePlayback(state, state.nextIdleIndex);
}

export function suspendIdlePlaylist(state: IdlePlaylistState): IdlePlaylistState {
  return {
    ...state,
    pendingPlayer: null,
    playbackSessionId: state.playbackSessionId + 1,
    suspended: true,
  };
}

export function resumeIdlePlaylist(state: IdlePlaylistState): IdlePlaylistState {
  return beginIdlePlayback(state, state.hasPlayed ? state.nextIdleIndex : 0);
}

export function chooseAvailableIdle(
  preferred: IdleIndex,
  unavailable: readonly [boolean, boolean],
): IdleIndex | null {
  if (!unavailable[preferred]) return preferred;

  const fallback = otherIdleIndex(preferred);
  return unavailable[fallback] ? null : fallback;
}

export function isIdlePlayerVisible(state: IdlePlaylistState, player: IdlePlayer) {
  return state.hasPlayed && state.activePlayer === player;
}

export async function playIdleVideoSafely(play: () => Promise<void>) {
  try {
    await play();
    return null;
  } catch (reason) {
    return reason;
  }
}
