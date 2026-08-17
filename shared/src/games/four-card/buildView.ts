import type {
  FourCardOpponentView,
  FourCardPlayerState,
  FourCardPlayerView,
  FourCardState,
  FourCardTeammateView,
} from './types.js';

/**
 * The narrow slice of "live" player info `buildFourCardView` actually needs
 * — just enough that both the real server (`LiveGamePlayer`, a superset of
 * this) and a purely client-side offline session (which has no socket/AI
 * config to speak of) can each satisfy it structurally, no adapter needed.
 */
export interface FourCardViewPlayerInfo {
  username: string;
  isAI: boolean;
  isConnected: boolean;
}

export interface FourCardViewContext {
  gameSessionId: string;
  players: Map<string, FourCardViewPlayerInfo>;
}

/**
 * Builds one player's wire view of a Four Card game — the single source of
 * truth for what's hidden vs. public (own hand private, every collector
 * always visible, no hint/valid-moves data ever included). Shared so the
 * real server (`server/src/game/adapters/fourCardAdapter.ts`) and a fully
 * offline client-side session use the exact same logic and can never drift
 * apart.
 */
export function buildFourCardView(
  state: FourCardState,
  userId: string,
  ctx: FourCardViewContext,
): FourCardPlayerView {
  const me = state.players.find((p) => p.userId === userId)!;
  const currentTurnUserId = state.phase === 'playing' ? state.turnOrder[state.currentTurnIndex] : null;

  const toOpponentView = (p: FourCardPlayerState): FourCardOpponentView => {
    const live = ctx.players.get(p.userId)!;
    return {
      userId: p.userId,
      username: live.username,
      isAI: live.isAI,
      isConnected: live.isConnected,
      handCount: p.hand.length,
      collectorId: p.collectorId,
    };
  };

  let teammate: FourCardTeammateView | null = null;
  let opponents: FourCardOpponentView[];

  if (state.mode === 'four-team') {
    const teammatePlayer = state.players.find((p) => p.userId !== userId && p.collectorId === me.collectorId);
    if (teammatePlayer) {
      const live = ctx.players.get(teammatePlayer.userId)!;
      teammate = {
        userId: teammatePlayer.userId,
        username: live.username,
        isAI: live.isAI,
        isConnected: live.isConnected,
        // A teammate's hand is hidden too — only handCount, same as any opponent.
        handCount: teammatePlayer.hand.length,
      };
    }
    opponents = state.players.filter((p) => p.collectorId !== me.collectorId).map(toOpponentView);
  } else {
    opponents = state.players.filter((p) => p.userId !== userId).map(toOpponentView);
  }

  return {
    gameSessionId: ctx.gameSessionId,
    mode: state.mode,
    tableCards: state.tableCards,
    drawPileCount: state.drawPile.length,
    yourUserId: userId,
    yourHand: me.hand,
    yourCollectorId: me.collectorId,
    // Every collector is always fully visible — captured cards are public
    // information the instant they're captured (see the type's own doc
    // comment) — and no hint data (like a valid-moves list) is ever
    // included here; the player must find their own moves by observation.
    collectors: state.collectors.map((c) => ({
      collectorId: c.collectorId,
      capturedStack: c.capturedStack,
      finalizedCards: c.finalizedCards,
      lockedGroups: c.lockedGroups,
    })),
    currentTurnUserId,
    turnPhase: state.turnPhase,
    shufflerUserId: state.shufflerUserId,
    opponents,
    teammate,
    phase: state.phase,
    winnerIds: state.winnerIds,
  };
}
