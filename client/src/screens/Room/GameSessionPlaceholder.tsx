import { getGameByKey, type RoomStartedPayload, type RoomStatePayload } from '@card-games/shared';
import { Link } from 'react-router-dom';

interface GameSessionPlaceholderProps {
  session: RoomStartedPayload;
  room: RoomStatePayload;
}

/**
 * Shown once a room transitions to `in_progress`. Confirms the full room
 * lifecycle (create -> join -> ready -> start) actually reached a real
 * GameSession row — the real per-game table UI replaces this screen once
 * that game's rules module ships.
 */
export function GameSessionPlaceholder({ session, room }: GameSessionPlaceholderProps) {
  const game = getGameByKey(room.gameKey);

  return (
    <div className="px-4 pt-4">
      <h1 className="text-xl font-display font-bold text-white mb-1">{game?.name ?? room.gameKey}</h1>
      <p className="text-xs text-gray-400 mb-6">Session {session.gameSessionId}</p>

      <div className="rounded-xl border border-dashed border-gold/20 p-6 text-center text-sm text-gray-300 mb-6">
        Room, players, and the game session are all live — {game?.name ?? 'this game'}&apos;s actual
        rules and table UI ship in the next phase. This screen just proves the room engine handed off
        correctly.
      </div>

      <ul className="space-y-2 mb-6">
        {room.players.map((p) => (
          <li
            key={p.userId}
            className="flex items-center justify-between rounded-lg bg-felt-light/40 px-3 py-2 text-sm"
          >
            <span className="text-gray-100">
              {p.username} {p.isHost && <span className="text-gold text-xs">(Host)</span>}
            </span>
            <span className="text-xs text-gray-400">Seat {p.seatIndex + 1}</span>
          </li>
        ))}
      </ul>

      <Link to="/" className="block text-center text-sm text-gold">
        Back to Lobby
      </Link>
    </div>
  );
}
