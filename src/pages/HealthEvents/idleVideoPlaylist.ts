export type NurseVideoIndex = 0 | 1 | 2;

export interface IdlePlaylistState {
  activeVideoIndex: NurseVideoIndex;
  nextVideoIndex: NurseVideoIndex;
  pendingVideoIndex: NurseVideoIndex | null;
  playbackSessionId: number;
  hasPlayed: boolean;
  suspended: boolean;
}

export function nextNurseVideoIndex(index: NurseVideoIndex): NurseVideoIndex {
  if (index === 0) return 1;
  return index === 1 ? 2 : 1;
}

export function createIdlePlaylistState(): IdlePlaylistState {
  return {
    activeVideoIndex: 0,
    nextVideoIndex: 1,
    pendingVideoIndex: null,
    playbackSessionId: 0,
    hasPlayed: false,
    suspended: true,
  };
}

export function beginIdlePlayback(
  state: IdlePlaylistState,
  videoIndex: NurseVideoIndex,
): IdlePlaylistState {
  return {
    ...state,
    pendingVideoIndex: videoIndex,
    playbackSessionId: state.playbackSessionId + 1,
    suspended: false,
  };
}

export function commitIdlePlayback(
  state: IdlePlaylistState,
  videoIndex: NurseVideoIndex,
  playbackSessionId: number,
): IdlePlaylistState {
  if (
    state.suspended ||
    state.pendingVideoIndex !== videoIndex ||
    state.playbackSessionId !== playbackSessionId
  ) {
    return state;
  }

  return {
    ...state,
    activeVideoIndex: videoIndex,
    nextVideoIndex: nextNurseVideoIndex(videoIndex),
    pendingVideoIndex: null,
    hasPlayed: true,
  };
}

export function requestNextIdlePlayback(
  state: IdlePlaylistState,
  videoIndex: NurseVideoIndex,
  playbackSessionId: number,
): IdlePlaylistState {
  if (
    state.suspended ||
    !state.hasPlayed ||
    state.pendingVideoIndex !== null ||
    state.activeVideoIndex !== videoIndex ||
    state.playbackSessionId !== playbackSessionId
  ) {
    return state;
  }

  return beginIdlePlayback(state, state.nextVideoIndex);
}

export function suspendIdlePlaylist(state: IdlePlaylistState): IdlePlaylistState {
  return {
    ...state,
    pendingVideoIndex: null,
    playbackSessionId: state.playbackSessionId + 1,
    suspended: true,
  };
}

export function resumeIdlePlaylist(state: IdlePlaylistState): IdlePlaylistState {
  return beginIdlePlayback(state, state.hasPlayed ? state.nextVideoIndex : 0);
}

export function chooseAvailableVideo(
  preferred: NurseVideoIndex,
  unavailable: readonly [boolean, boolean, boolean],
): NurseVideoIndex | null {
  const candidates: readonly NurseVideoIndex[] = preferred === 0
    ? [0, 1, 2]
    : preferred === 1
      ? [1, 2]
      : [2, 1];
  return candidates.find((index) => !unavailable[index]) ?? null;
}

export function isVideoVisible(state: IdlePlaylistState, videoIndex: NurseVideoIndex) {
  return state.activeVideoIndex === videoIndex;
}

export async function playIdleVideoSafely(play: () => Promise<void>) {
  try {
    await play();
    return null;
  } catch (reason) {
    return reason;
  }
}

interface PlayableIdleVideo {
  currentTime: number;
  duration: number;
  ended: boolean;
  networkState: number;
  load: () => void;
  play: () => Promise<void>;
}

export async function loadAndPlayIdleVideo(video: PlayableIdleVideo) {
  if (video.networkState === 0) video.load();
  if (video.ended || (Number.isFinite(video.duration) && video.currentTime >= video.duration - 0.05)) {
    video.currentTime = 0;
  }
  return playIdleVideoSafely(() => video.play());
}
