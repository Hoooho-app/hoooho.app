import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  beginIdlePlayback,
  chooseAvailableVideo,
  commitIdlePlayback,
  createIdlePlaylistState,
  isVideoVisible,
  playIdleVideoSafely,
  requestNextIdlePlayback,
  resumeIdlePlaylist,
  suspendIdlePlaylist,
} from './idleVideoPlaylist';

describe('idle video playlist', () => {
  it('plays intro0 once, then alternates idle1 -> idle2 -> idle1', () => {
    let state = resumeIdlePlaylist(createIdlePlaylistState());
    const played: number[] = [];

    for (let step = 0; step < 8; step += 1) {
      assert.notEqual(state.pendingVideoIndex, null)
      const videoIndex = state.pendingVideoIndex!
      played.push(videoIndex)
      state = commitIdlePlayback(state, videoIndex, state.playbackSessionId)
      state = requestNextIdlePlayback(state, videoIndex, state.playbackSessionId)
    }

    assert.deepEqual(played, [0, 1, 2, 1, 2, 1, 2, 1])
    assert.equal(played.filter((index) => index === 0).length, 1)
  });

  it('advances only from the ended media event without a wait state', () => {
    let state = resumeIdlePlaylist(createIdlePlaylistState());
    state = commitIdlePlayback(state, 0, state.playbackSessionId)

    assert.equal(state.pendingVideoIndex, null)
    state = requestNextIdlePlayback(state, 0, state.playbackSessionId)
    assert.equal(state.pendingVideoIndex, 1)
  });

  it('resumes with the next loop video after business-state suspension', () => {
    let state = resumeIdlePlaylist(createIdlePlaylistState());
    state = commitIdlePlayback(state, 0, state.playbackSessionId);
    state = suspendIdlePlaylist(state);
    state = resumeIdlePlaylist(state);

    assert.equal(state.pendingVideoIndex, 1)
  });

  it('ignores late callbacks from an invalidated playback session', () => {
    let state = resumeIdlePlaylist(createIdlePlaylistState());
    const staleSessionId = state.playbackSessionId;
    state = suspendIdlePlaylist(state);
    state = resumeIdlePlaylist(state);

    const unchanged = commitIdlePlayback(state, 0, staleSessionId);
    assert.equal(unchanged, state)
    assert.equal(unchanged.pendingVideoIndex, 0)
  });

  it('does not create duplicate transitions for duplicate ended events', () => {
    let state = resumeIdlePlaylist(createIdlePlaylistState());
    state = commitIdlePlayback(state, 0, state.playbackSessionId);
    const activeSessionId = state.playbackSessionId;

    const first = requestNextIdlePlayback(state, 0, activeSessionId);
    const duplicate = requestNextIdlePlayback(first, 0, activeSessionId);

    assert.equal(duplicate, first)
    assert.equal(duplicate.pendingVideoIndex, 1)
  });

  it('keeps the current video visible until the next video is playing', () => {
    let state = resumeIdlePlaylist(createIdlePlaylistState());
    state = commitIdlePlayback(state, 0, state.playbackSessionId);
    state = requestNextIdlePlayback(state, 0, state.playbackSessionId);

    assert.equal(isVideoVisible(state, 0), true)
    assert.equal(isVideoVisible(state, 1), false)

    state = commitIdlePlayback(state, 1, state.playbackSessionId)
    assert.equal(isVideoVisible(state, 0), false)
    assert.equal(isVideoVisible(state, 1), true)
  });

  it('never falls back to intro0 after the welcome phase', () => {
    assert.equal(chooseAvailableVideo(0, [true, false, false]), 1)
    assert.equal(chooseAvailableVideo(1, [false, true, false]), 2)
    assert.equal(chooseAvailableVideo(2, [false, false, true]), 1)
    assert.equal(chooseAvailableVideo(1, [false, true, true]), null)
  });

  it('can explicitly restart a healthy loop video after its peer fails', () => {
    let state = resumeIdlePlaylist(createIdlePlaylistState());
    state = commitIdlePlayback(state, 0, state.playbackSessionId);
    state = beginIdlePlayback(state, chooseAvailableVideo(1, [false, true, false]) ?? 1);
    state = commitIdlePlayback(state, 2, state.playbackSessionId);

    assert.equal(state.activeVideoIndex, 2)
    assert.equal(state.nextVideoIndex, 1)
  });

  it('catches play promise failures without an unhandled rejection', async () => {
    const failure = new Error('blocked')
    assert.equal(await playIdleVideoSafely(() => Promise.reject(failure)), failure)
    assert.equal(await playIdleVideoSafely(() => Promise.resolve()), null)
  });
});
