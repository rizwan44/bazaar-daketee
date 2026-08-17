import type { AIConfig } from '@card-games/shared';

export interface LiveGamePlayer {
  userId: string;
  username: string;
  seatIndex: number;
  isAI: boolean;
  aiConfig?: AIConfig;
  socketId: string | null;
  isConnected: boolean;
}

export interface HandSettlementResult {
  userId: string;
  isAI: boolean;
  placement: number;
  coinDelta: number;
  finalBalance: number;
}

export interface GameResultEntry {
  userId: string;
  isAI: boolean;
  placement: number;
  score: number;
}

export interface RecordMoveInput {
  gameSessionId: string;
  userId: string;
  moveType: string;
  payload: Record<string, unknown> | undefined;
  moveIndex: number;
}

/**
 * The narrow slice of Prisma `GameSessionManager` needs, injected so tests
 * can supply an in-memory fake instead of requiring a live MySQL connection
 * — same rationale as `RoomPersistence`.
 */
export interface GamePersistence {
  /** AI seats get a fixed balance here, never a persisted one — see `PrismaGamePersistence` for why. */
  getPlayerBalances(players: { userId: string; isAI: boolean }[]): Promise<Record<string, number>>;
  settleHand(input: { gameSessionId: string; results: HandSettlementResult[] }): Promise<void>;
  /** For games with no coin economy (e.g. Four Card) — records placement/score without touching Profile.coins. */
  recordGameResult(input: { gameSessionId: string; results: GameResultEntry[] }): Promise<void>;
  /** Move-by-move history for replay/anti-cheat (the `GameMove` table) — logged generically for every game, not just Four Card. */
  recordMove(input: RecordMoveInput): Promise<void>;
}
