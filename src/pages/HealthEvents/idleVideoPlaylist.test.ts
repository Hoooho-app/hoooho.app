import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  beginIdlePlayback,
  chooseAvailableIdle,
  commitIdlePlayback,
  createIdlePlaylistState,
  requestNextIdlePlayback,
  resumeIdlePlaylist,
  suspendIdlePlaylist,
} from './idleVideoPlaylist';

describe('idle video playlist', () => {
  it('alternates 1 -> 2 -> 1 -> 2 using ended transitions', () => {
    let state = resumeIdlePlaylist(createIdlePlaylistState());
    assert.equal(state.pendingPlayer, 0)

    state = commitIdlePlayback(state, 0, state.playbackSessionId);
    assert.deepEqual([state.activeIdleIndex, state.nextIdleIndex], [0, 1])

    state = requestNextIdlePlayback(state, 0, state.playbackSessionId);
    assert.equal(state.pendingPlayer, 1)
    state = commitIdlePlayback(state, 1, state.playbackSessionId);

    state = requestNextIdlePlayback(state, 1, state.playbackSessionId);
    assert.equal(state.pendingPlayer, 0)
    state = commitIdlePlayback(state, 0, state.playbackSessionId);

    state = requestNextIdlePlayback(state, 0, state.playbackSessionId);
    assert.equal(state.pendingPlayer, 1)
  });

  it('resumes with the next idle after a special animation', () => {
    let state = resumeIdlePlaylist(createIdlePlaylistState());
    state = commitIdlePlayback(state, 0, state.playbackSessionId);
    state = suspendIdlePlaylist(state);
    state = resumeIdlePlaylist(state);

    assert.equal(state.pendingPlayer, 1)
  });

  it('ignores late callbacks from an invalidated playback session', () => {
    let state = resumeIdlePlaylist(createIdlePlaylistState());
    const staleSessionId = state.playbackSessionId;
    state = suspendIdlePlaylist(state);
    state = resumeIdlePlaylist(state);

    const unchanged = commitIdlePlayback(state, 0, staleSessionId);
    assert.equal(unchanged, state)
    assert.equal(unchanged.pendingPlayer, 0)
  });

  it('does not create duplicate transitions for duplicate ended events', () => {
    let state = resumeIdlePlaylist(createIdlePlaylistState());
    state = commitIdlePlayback(state, 0, state.playbackSessionId);
    const activeSessionId = state.playbackSessionId;

    const first = requestNextIdlePlayback(state, 0, activeSessionId);
    const duplicate = requestNextIdlePlayback(first, 0, activeSessionId);

    assert.equal(duplicate, first)
    assert.equal(duplicate.pendingPlayer, 1)
  });

  it('falls back to the healthy idle and restores alternation when available', () => {
    assert.equal(chooseAvailableIdle(1, [false, true]), 0)
    assert.equal(chooseAvailableIdle(0, [true, false]), 1)
    assert.equal(chooseAvailableIdle(0, [true, true]), null)
    assert.equal(chooseAvailableIdle(1, [false, false]), 1)
  });

  it('can explicitly restart the healthy player after its peer fails', () => {
    let state = resumeIdlePlaylist(createIdlePlaylistState());
    state = commitIdlePlayback(state, 0, state.playbackSessionId);
    state = beginIdlePlayback(state, chooseAvailableIdle(1, [false, true]) ?? 0);
    state = commitIdlePlayback(state, 0, state.playbackSessionId);

    assert.equal(state.activePlayer, 0)
    assert.equal(state.nextIdleIndex, 1)
  });
});
