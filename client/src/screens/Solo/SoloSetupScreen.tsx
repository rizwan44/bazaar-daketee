import {
  AI_DIFFICULTIES,
  AI_PERSONALITIES,
  GAME_CATALOG,
  type AIDifficulty,
  type AIPersonality,
  type FourCardGameMode,
} from '@card-games/shared';
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { startLocalGame } from '../../local/LocalGameSession';
import { createRoom, ensureRoomSocketReady, fillAI } from '../../services/roomSocket';
import { useRoomStore } from '../../store/roomStore';

const DIFFICULTY_LABEL: Record<AIDifficulty, string> = {
  easy: 'Easy',
  normal: 'Normal',
  hard: 'Hard',
  expert: 'Expert',
};

const PERSONALITY_LABEL: Record<AIPersonality, string> = {
  friendly: 'Friendly',
  aggressive: 'Aggressive',
  defensive: 'Defensive',
  smart: 'Smart',
  funny: 'Funny',
};

export function SoloSetupScreen() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { room, error, clearError } = useRoomStore();
  const requestedGame = searchParams.get('game');
  const [gameKey, setGameKey] = useState(
    GAME_CATALOG.some((g) => g.key === requestedGame) ? requestedGame! : GAME_CATALOG[0].key,
  );
  const [difficulty, setDifficulty] = useState<AIDifficulty>('normal');
  const [personality, setPersonality] = useState<AIPersonality>('friendly');
  const [requested, setRequested] = useState(false);
  const [aiRequested, setAiRequested] = useState(false);

  const game = GAME_CATALOG.find((g) => g.key === gameKey)!;
  const [modeKey, setModeKey] = useState(game.modes?.[0]?.key);
  const modeVariant = game.modes?.find((m) => m.key === modeKey) ?? game.modes?.[0];
  const effectiveMinPlayers = modeVariant?.minPlayers ?? game.minPlayers;
  const aiSeatsNeeded = Math.max(0, effectiveMinPlayers - 1);

  useEffect(() => {
    // Reset to the new game's first mode (or none) whenever the game selection changes.
    setModeKey(GAME_CATALOG.find((g) => g.key === gameKey)?.modes?.[0]?.key);
  }, [gameKey]);

  useEffect(() => {
    ensureRoomSocketReady();
  }, []);

  // Once our solo room exists, fill the remaining seats with AI — this is
  // the entire "solo mode": a room where every other seat is AI-controlled.
  useEffect(() => {
    if (requested && room?.code && !aiRequested) {
      setAiRequested(true);
      for (let i = 0; i < aiSeatsNeeded; i++) {
        fillAI(room.code, { difficulty, personality });
      }
    }
  }, [requested, room, aiRequested, aiSeatsNeeded, difficulty, personality]);

  useEffect(() => {
    if (aiRequested && room && room.players.length >= effectiveMinPlayers) {
      navigate(`/room/${room.code}`);
    }
  }, [aiRequested, room, effectiveMinPlayers, navigate]);

  const handleStart = () => {
    clearError();
    // Drop any stale room from a previous session first — otherwise the
    // fillAI effect below can fire against the OLD (already-finished) room
    // before this create's real response arrives, which the server then
    // rejects since that room is no longer 'waiting'.
    useRoomStore.getState().clearRoom();
    setRequested(true);
    createRoom(gameKey, true, modeKey);
  };

  // Fully offline — no server/socket touched at all (see LocalGameSession.ts).
  // Scoped to 4 Card only for now; other games still go through the real room flow above.
  const canPlayOffline = gameKey === 'four-card';
  const handlePlayOffline = () => {
    useRoomStore.getState().clearRoom();
    startLocalGame({ mode: (modeKey as FourCardGameMode) ?? 'two-player', difficulty, personality });
    navigate('/room/LOCAL');
  };

  return (
    <div className="px-4 pt-4">
      <h1 className="text-xl font-display font-bold text-white mb-1">Solo vs AI</h1>
      <p className="text-xs text-gray-400 mb-6">
        Pick a game and an opponent difficulty — you&apos;ll play against computer-controlled seats.
      </p>

      <label className="block mb-4">
        <span className="text-xs text-gray-400">Game</span>
        <select
          value={gameKey}
          onChange={(e) => setGameKey(e.target.value)}
          className="mt-1 w-full rounded-lg bg-felt-light/50 border border-gold/10 px-3 py-2.5 text-sm text-white outline-none focus:border-gold/50"
        >
          {GAME_CATALOG.map((g) => (
            <option key={g.key} value={g.key}>
              {g.name} ({g.minPlayers}-{g.maxPlayers} players)
            </option>
          ))}
        </select>
      </label>

      {game.modes && (
        <label className="block mb-4">
          <span className="text-xs text-gray-400">Mode</span>
          <div className="mt-1 grid grid-cols-1 gap-2">
            {game.modes.map((m) => (
              <button
                key={m.key}
                onClick={() => setModeKey(m.key)}
                className={[
                  'min-h-[44px] rounded-lg text-sm font-medium px-3 text-left',
                  modeKey === m.key ? 'bg-gold text-felt-dark' : 'bg-felt-light/50 text-gray-300',
                ].join(' ')}
              >
                {m.label}
              </button>
            ))}
          </div>
        </label>
      )}

      <div className="mb-4">
        <span className="text-xs text-gray-400">AI Difficulty</span>
        <div className="mt-1 grid grid-cols-4 gap-2">
          {AI_DIFFICULTIES.map((d) => (
            <button
              key={d}
              onClick={() => setDifficulty(d)}
              className={[
                'min-h-[44px] rounded-lg text-xs font-medium',
                difficulty === d ? 'bg-gold text-felt-dark' : 'bg-felt-light/50 text-gray-300',
              ].join(' ')}
            >
              {DIFFICULTY_LABEL[d]}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-6">
        <span className="text-xs text-gray-400">AI Personality</span>
        <div className="mt-1 grid grid-cols-3 gap-2">
          {AI_PERSONALITIES.map((p) => (
            <button
              key={p}
              onClick={() => setPersonality(p)}
              className={[
                'min-h-[44px] rounded-lg text-xs font-medium',
                personality === p ? 'bg-gold text-felt-dark' : 'bg-felt-light/50 text-gray-300',
              ].join(' ')}
            >
              {PERSONALITY_LABEL[p]}
            </button>
          ))}
        </div>
      </div>

      <p className="text-[11px] text-gray-500 mb-4">
        {aiSeatsNeeded > 0
          ? `${aiSeatsNeeded} AI opponent${aiSeatsNeeded > 1 ? 's' : ''} will join automatically.`
          : 'This game only needs one player.'}
      </p>

      {error && <p className="text-xs text-red-400 mb-4">{error.message}</p>}

      <div className="flex flex-col gap-2">
        <button
          onClick={handleStart}
          disabled={requested}
          className="w-full min-h-[44px] rounded-lg bg-gold text-felt-dark font-semibold py-3 disabled:opacity-60"
        >
          {requested ? 'Setting up…' : 'Start Solo Game'}
        </button>
        {canPlayOffline && (
          <button
            onClick={handlePlayOffline}
            disabled={requested}
            className="w-full min-h-[44px] rounded-lg bg-felt-light/60 border border-gold/20 text-gray-100 font-semibold py-3 disabled:opacity-60"
          >
            Play Offline (no internet needed)
          </button>
        )}
      </div>
    </div>
  );
}
