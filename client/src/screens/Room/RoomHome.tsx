import { Link } from 'react-router-dom';
import { useConnectionStore } from '../../store/connectionStore';

export function RoomHome() {
  const { username, setUsername } = useConnectionStore();

  return (
    <div className="px-4 pt-4">
      <h1 className="text-xl font-display font-bold text-white mb-1">Play with Friends</h1>
      <p className="text-xs text-gray-400 mb-6">
        Create a room and share the code, or join one a friend already started — online or over the
        same WiFi with no internet needed.
      </p>

      <label className="block mb-6">
        <span className="text-xs text-gray-400">Your display name</span>
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          maxLength={24}
          className="mt-1 w-full rounded-lg bg-felt-light/50 border border-gold/10 px-3 py-2.5 text-sm text-white outline-none focus:border-gold/50"
        />
      </label>

      <div className="flex flex-col gap-3">
        <Link
          to="/room/create"
          className="rounded-xl bg-gold text-felt-dark font-semibold text-center py-4 shadow-card active:scale-[0.98] transition-transform"
        >
          Create Room
        </Link>
        <Link
          to="/room/join"
          className="rounded-xl bg-felt-light/60 border border-gold/20 text-gray-100 font-semibold text-center py-4 active:scale-[0.98] transition-transform"
        >
          Join Room
        </Link>
      </div>
    </div>
  );
}
