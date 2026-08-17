import { GAME_CATALOG } from '@card-games/shared';
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { createRoom, ensureRoomSocketReady } from '../../services/roomSocket';
import { useRoomStore } from '../../store/roomStore';

export function CreateRoomScreen() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { room, error, clearError } = useRoomStore();
  const requestedGame = searchParams.get('game');
  const [gameKey, setGameKey] = useState(
    GAME_CATALOG.some((g) => g.key === requestedGame) ? requestedGame! : GAME_CATALOG[0].key,
  );
  const [isPrivate, setIsPrivate] = useState(true);
  const [requested, setRequested] = useState(false);

  const game = GAME_CATALOG.find((g) => g.key === gameKey)!;
  const [modeKey, setModeKey] = useState(game.modes?.[0]?.key);

  useEffect(() => {
    // Reset to the new game's first mode (or none) whenever the game selection changes.
    setModeKey(GAME_CATALOG.find((g) => g.key === gameKey)?.modes?.[0]?.key);
  }, [gameKey]);

  useEffect(() => {
    ensureRoomSocketReady();
  }, []);

  useEffect(() => {
    if (requested && room?.code) {
      navigate(`/room/${room.code}`);
    }
  }, [requested, room, navigate]);

  const handleCreate = () => {
    clearError();
    // Drop any stale room from a previous session first — otherwise the
    // "navigate once room?.code shows up" effect above can fire on the OLD
    // room before this create's real response arrives.
    useRoomStore.getState().clearRoom();
    setRequested(true);
    createRoom(gameKey, isPrivate, modeKey);
  };

  return (
    <div className="px-4 pt-4">
      <h1 className="text-xl font-display font-bold text-white mb-4">Create Room</h1>

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

      <div className="flex items-center justify-between mb-6 py-2">
        <span className="text-sm text-gray-200">Private room</span>
        <button
          onClick={() => setIsPrivate((v) => !v)}
          className={[
            'w-12 h-7 rounded-full relative transition-colors',
            isPrivate ? 'bg-gold' : 'bg-gray-600',
          ].join(' ')}
          aria-pressed={isPrivate}
        >
          <span
            className={[
              'absolute top-0.5 h-6 w-6 rounded-full bg-white transition-transform',
              isPrivate ? 'translate-x-5' : 'translate-x-0.5',
            ].join(' ')}
          />
        </button>
      </div>

      {error && <p className="text-xs text-red-400 mb-4">{error.message}</p>}

      <button
        onClick={handleCreate}
        className="w-full min-h-[44px] rounded-lg bg-gold text-felt-dark font-semibold py-3"
      >
        Create Room
      </button>
    </div>
  );
}
