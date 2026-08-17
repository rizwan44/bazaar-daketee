import {
  SOCKET_EVENTS,
  teenPattiEngine,
  teenPattiMoveScorer,
  type GameEndedPayload,
  type TeenPattiOpponentView,
  type TeenPattiPlayerView,
  type TeenPattiState,
} from '@card-games/shared';
import type { AdapterSettleContext, AdapterViewContext, GameAdapter } from './types.js';

export const teenPattiAdapter: GameAdapter<TeenPattiState> = {
  gameKey: 'teen-patti',
  engine: teenPattiEngine,
  scorer: teenPattiMoveScorer,
  turnTimeoutMs: 20_000,

  async preparePlayers(info, persistence) {
    const balances = await persistence.getPlayerBalances(
      info.players.map((p) => ({ userId: p.userId, isAI: p.isAI })),
    );
    return {
      playerRefs: info.players.map((p) => ({
        playerId: p.userId,
        isAI: p.isAI,
        startingBalance: balances[p.userId],
      })),
      adapterData: balances,
    };
  },

  shouldAdvanceTurn(moveType) {
    // Seeing your cards is free and doesn't end your turn — the same player
    // immediately gets to choose fold/chaal/raise/show with a fresh timer.
    return moveType !== 'see';
  },

  buildView(state, userId, ctx: AdapterViewContext): TeenPattiPlayerView {
    const me = state.players.find((p) => p.userId === userId)!;
    const meLive = ctx.players.get(userId)!;
    const currentTurnUserId = state.phase === 'betting' ? state.turnOrder[state.currentTurnIndex] : null;

    const opponents: TeenPattiOpponentView[] = [...ctx.players.values()]
      .filter((p) => p.userId !== userId)
      .map((p) => {
        const ps = state.players.find((x) => x.userId === p.userId)!;
        return {
          userId: p.userId,
          username: p.username,
          seatIndex: p.seatIndex,
          status: ps.status,
          isSeen: ps.isSeen,
          isConnected: p.isConnected,
          isAI: p.isAI,
          cardCount: ps.hand.length,
        };
      });

    return {
      gameSessionId: ctx.gameSessionId,
      pot: state.pot,
      currentStake: state.currentStake,
      bootAmount: state.bootAmount,
      phase: state.phase,
      yourUserId: userId,
      yourSeatIndex: meLive.seatIndex,
      yourHand: me.hand,
      yourIsSeen: me.isSeen,
      yourRemainingCoins: me.remainingCoins,
      yourValidMoves: teenPattiEngine.getValidMoves(state, userId),
      currentTurnUserId,
      turnExpiresAt:
        ctx.turnExpiresAtMs && state.phase === 'betting' ? new Date(ctx.turnExpiresAtMs).toISOString() : null,
      opponents,
      winnerId: state.winnerId,
      revealedHands: state.revealedHands,
    };
  },

  async settle(ctx: AdapterSettleContext<TeenPattiState>) {
    const state = ctx.state;
    const winnerId = state.winnerId;
    if (!winnerId) return null;

    const startingBalances = (ctx.adapterData as Record<string, number>) ?? {};
    const results = [...ctx.players.values()].map((player) => {
      const engineState = state.players.find((p) => p.userId === player.userId)!;
      const finalBalance =
        player.userId === winnerId ? engineState.remainingCoins + state.pot : engineState.remainingCoins;
      const startingBalance = startingBalances[player.userId] ?? 0;
      return {
        userId: player.userId,
        isAI: player.isAI,
        placement: player.userId === winnerId ? 1 : 2,
        coinDelta: finalBalance - startingBalance,
        finalBalance,
      };
    });

    await ctx.persistence.settleHand({ gameSessionId: ctx.gameSessionId, results });

    const endedPayload: GameEndedPayload = {
      gameSessionId: ctx.gameSessionId,
      winnerId,
      revealedHands: state.revealedHands ?? {},
      potWon: state.pot,
      coinDeltas: Object.fromEntries(results.map((r) => [r.userId, r.coinDelta])),
    };
    return { event: SOCKET_EVENTS.GAME_ENDED, payload: endedPayload };
  },
};
