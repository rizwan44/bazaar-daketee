import {
  buildFourCardView,
  computeCollectorScores,
  fourCardEngine,
  fourCardMoveScorer,
  SOCKET_EVENTS,
  type FourCardEndedPayload,
  type FourCardPlayerView,
  type FourCardState,
} from '@card-games/shared';
import type { AdapterSettleContext, AdapterViewContext, GameAdapter } from './types.js';

export const fourCardAdapter: GameAdapter<FourCardState> = {
  gameKey: 'four-card',
  engine: fourCardEngine,
  scorer: fourCardMoveScorer,
  // "No timer" is explicit and repeated throughout the spec — a turn stays
  // open indefinitely until the player acts themselves.
  turnTimeoutMs: null,

  async preparePlayers(info) {
    // No betting/coin economy for this game — no persistence lookup needed.
    const isTeam = info.mode === 'four-team';
    return {
      playerRefs: info.players.map((p) => ({
        playerId: p.userId,
        isAI: p.isAI,
        teamId: isTeam ? (p.seatIndex % 2 === 0 ? 'team-1' : 'team-2') : undefined,
        isShuffler: p.userId === info.shufflerUserId,
      })),
      adapterData: undefined,
    };
  },

  shouldAdvanceTurn() {
    // applyMove already fully decides turn-passing internally (only a
    // discard advances currentTurnIndex) — nextTurn's only remaining job is
    // checking whether the draw pile just ran out, which is safe to check
    // after every move.
    return true;
  },

  buildView(state, userId, ctx: AdapterViewContext): FourCardPlayerView {
    // The view-shaping logic itself lives in `shared` (`buildFourCardView`)
    // so a fully offline client-side session can build the identical view
    // without ever depending on `server/` — this adapter method is now just
    // the server-specific wiring (LiveGamePlayer → the minimal player-info
    // shape the shared builder actually needs).
    return buildFourCardView(state, userId, ctx);
  },

  async settle(ctx: AdapterSettleContext<FourCardState>) {
    const state = ctx.state;
    if (state.phase !== 'complete') return null;

    const collectorScores = computeCollectorScores(state);
    const scoreValues = Object.values(collectorScores);
    const maxScore = Math.max(...scoreValues);
    const minScore = Math.min(...scoreValues);
    // Dense ranking over distinct collector scores — correct for 2 collectors
    // (2P/team, placement is just 1 or 2) and for 4 distinct collectors
    // (4P-individual, real 1st/2nd/3rd/4th).
    const distinctScoresDesc = [...new Set(scoreValues)].sort((a, b) => b - a);
    const placementForScore = (score: number) => distinctScoresDesc.indexOf(score) + 1;

    const results = [...ctx.players.values()].map((player) => {
      const statePlayer = state.players.find((p) => p.userId === player.userId)!;
      const score = collectorScores[statePlayer.collectorId] ?? 0;
      return { userId: player.userId, isAI: player.isAI, placement: placementForScore(score), score };
    });

    await ctx.persistence.recordGameResult({ gameSessionId: ctx.gameSessionId, results });

    // Loser(s) = whoever's collector scored the LOWEST — used to pick the
    // next game's shuffler on a rematch (see RoomManager.pickShufflerUserId).
    // A full tie (every collector scored the same) has no meaningful loser.
    const isFullTie = minScore === maxScore;
    const loserUserIds = isFullTie ? [] : results.filter((r) => r.score === minScore).map((r) => r.userId);

    const payload: FourCardEndedPayload = {
      gameSessionId: ctx.gameSessionId,
      mode: state.mode,
      winnerIds: state.winnerIds,
      scores: collectorScores,
    };
    return {
      event: SOCKET_EVENTS.GAME_ENDED,
      payload,
      loserUserIds,
      resultSummary: { scores: collectorScores, winnerIds: state.winnerIds },
    };
  },
};
