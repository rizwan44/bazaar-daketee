import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ensureRoomSocketReady, joinRoom } from '../../services/roomSocket';
import { useRoomStore } from '../../store/roomStore';

export function JoinRoomScreen() {
  const navigate = useNavigate();
  const { room, error, clearError } = useRoomStore();
  const [code, setCode] = useState('');
  const [requested, setRequested] = useState(false);

  useEffect(() => {
    ensureRoomSocketReady();
  }, []);

  useEffect(() => {
    if (requested && room?.code) {
      navigate(`/room/${room.code}`);
    }
  }, [requested, room, navigate]);

  const handleJoin = () => {
    if (code.trim().length < 4) return;
    clearError();
    // Drop any stale room from a previous session first — otherwise the
    // "navigate once room?.code shows up" effect above can fire on the OLD
    // room before this join's real response arrives.
    useRoomStore.getState().clearRoom();
    setRequested(true);
    joinRoom(code);
  };

  return (
    <div className="px-4 pt-4">
      <h1 className="text-xl font-display font-bold text-white mb-4">Join Room</h1>

      <label className="block mb-4">
        <span className="text-xs text-gray-400">Room code</span>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          maxLength={6}
          placeholder="AB7K92"
          className="mt-1 w-full rounded-lg bg-felt-light/50 border border-gold/10 px-3 py-3 text-center text-2xl tracking-[0.3em] text-white placeholder:text-gray-600 outline-none focus:border-gold/50"
        />
      </label>

      {error && <p className="text-xs text-red-400 mb-4">{error.message}</p>}

      <button
        onClick={handleJoin}
        disabled={code.trim().length < 4}
        className="w-full min-h-[44px] rounded-lg bg-gold text-felt-dark font-semibold py-3 disabled:opacity-40"
      >
        Join Room
      </button>
    </div>
  );
}
