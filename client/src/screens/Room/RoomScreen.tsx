import type { RoomPlayerView } from '@card-games/shared';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { QrCode } from '../../components/room/QrCode';
import { isNativePlatform } from '../../env/platform';
import {
  ensureRoomSocketReady,
  joinRoom,
  kickPlayer,
  leaveRoom,
  respondToRematch,
  setReady,
  startGame,
} from '../../services/roomSocket';
import { FourCardTable } from '../Game/FourCardTable';
import { TeenPattiTable } from '../Game/TeenPattiTable';
import { useConnectionStore } from '../../store/connectionStore';
import { useRoomStore } from '../../store/roomStore';
import { GameSessionPlaceholder } from './GameSessionPlaceholder';

function PlayerRow({
  player,
  isSelf,
  canKick,
  onKick,
}: {
  player: RoomPlayerView;
  isSelf: boolean;
  canKick: boolean;
  onKick: () => void;
}) {
  return (
    <li className="flex items-center justify-between rounded-lg bg-felt-light/40 px-3 py-2.5">
      <div className="flex items-center gap-2">
        <span
          className={['h-2 w-2 rounded-full', player.isConnected ? 'bg-emerald-400' : 'bg-amber-400'].join(
            ' ',
          )}
          title={player.isConnected ? 'Connected' : 'Reconnecting...'}
        />
        <span className="text-sm text-gray-100">
          {player.username}
          {isSelf && ' (You)'}
        </span>
        {player.isHost && <span className="text-[10px] rounded-full bg-gold/20 text-gold px-2 py-0.5">Host</span>}
        {player.isAI && (
          <span className="text-[10px] rounded-full bg-sky-500/20 text-sky-300 px-2 py-0.5 capitalize">
            AI · {player.aiDifficulty} · {player.aiPersonality}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <span
          className={[
            'text-[11px] rounded-full px-2 py-0.5',
            player.isReady ? 'bg-emerald-500/20 text-emerald-300' : 'bg-gray-600/40 text-gray-400',
          ].join(' ')}
        >
          {player.isReady ? 'Ready' : 'Not ready'}
        </span>
        {canKick && (
          <button onClick={onKick} className="text-[11px] text-red-400 min-h-[28px] px-1">
            Remove
          </button>
        )}
      </div>
    </li>
  );
}

/**
 * Shown on the lobby view instead of the normal ready/start controls
 * whenever a rematch request is pending (`room.rematchRequestedBy` set —
 * see `RoomManager.requestRematch`). Accepting reuses the same `isReady`
 * flag as the normal lobby, but the auto-start-on-full-consent trigger only
 * lives inside `respondToRematch`, so this banner's Accept button — not the
 * generic "I'm Ready" toggle — is what actually starts the next game.
 */
function RematchBanner({
  room,
  self,
}: {
  room: { code: string; players: RoomPlayerView[]; rematchRequestedBy?: string };
  self?: RoomPlayerView;
}) {
  const requester = room.players.find((p) => p.userId === room.rematchRequestedBy);
  const alreadyAccepted = self?.isReady ?? false;

  return (
    <div className="rounded-xl bg-felt-light/40 border border-gold/20 p-4 mb-4">
      <p className="text-sm text-gray-100 mb-3">
        <span className="text-gold font-semibold">{requester?.username ?? 'A player'}</span> wants a rematch
      </p>
      <ul className="space-y-1 mb-3">
        {room.players.map((p) => (
          <li key={p.userId} className="flex items-center justify-between text-xs">
            <span className="text-gray-300">{p.username}</span>
            <span className={p.isReady ? 'text-emerald-300' : 'text-gray-500'}>
              {p.isReady ? 'Ready' : 'Waiting'}
            </span>
          </li>
        ))}
      </ul>
      {alreadyAccepted ? (
        <p className="text-[11px] text-gray-400 text-center">Waiting for everyone else to accept…</p>
      ) : (
        <div className="flex gap-3">
          <button
            onClick={() => respondToRematch(room.code, true)}
            className="flex-1 min-h-[44px] rounded-lg bg-emerald-500 text-felt-dark font-semibold py-2.5"
          >
            Accept
          </button>
          <button
            onClick={() => respondToRematch(room.code, false)}
            className="flex-1 min-h-[44px] rounded-lg bg-felt-light/60 border border-red-400/30 text-red-300 font-semibold py-2.5"
          >
            Decline
          </button>
        </div>
      )}
    </div>
  );
}

interface NetworkInfo {
  lanAddresses: string[];
  port: number;
}

function LanQrPanel({ code }: { code: string }) {
  const serverUrl = useConnectionStore((s) => s.serverUrl);
  const [info, setInfo] = useState<NetworkInfo | null>(null);
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!show || info) return;
    fetch(`${serverUrl}/api/network-info`)
      .then((r) => r.json())
      .then(setInfo)
      .catch(() => setInfo(null));
  }, [show, info, serverUrl]);

  const lanIp = info?.lanAddresses[0];
  // window.location.protocol/port describe the PAGE's own origin — meaningful
  // for the web build (a friend opens this exact URL in their own browser),
  // but meaningless inside a Capacitor WebView (origin is capacitor://localhost
  // with no real port, not a URL anyone else could ever open). The native app
  // build shows the raw address instead — wiring a real phone-to-phone deep
  // link is separate follow-up work, not a web-origin question.
  const native = isNativePlatform();
  const clientPort = !native && window.location.port ? `:${window.location.port}` : '';
  const joinUrl =
    lanIp && !native ? `${window.location.protocol}//${lanIp}${clientPort}/join/${code}?server=${lanIp}:${info?.port}` : null;

  if (!show) {
    return (
      <button onClick={() => setShow(true)} className="text-xs text-gold underline mb-4">
        Host on this device (LAN) — show QR
      </button>
    );
  }

  return (
    <div className="mb-4 rounded-xl bg-felt-light/40 border border-gold/10 p-4 text-center">
      {joinUrl ? (
        <>
          <QrCode value={joinUrl} size={160} />
          <p className="text-[11px] text-gray-400 mt-2">
            Scan with a friend&apos;s camera on the same WiFi — no internet needed.
          </p>
        </>
      ) : lanIp ? (
        <p className="text-xs text-gray-300">
          Have others connect to <span className="font-mono text-gold">{lanIp}:{info?.port}</span> on the same WiFi.
        </p>
      ) : (
        <p className="text-xs text-gray-400">No LAN address found — is this device on WiFi/Ethernet?</p>
      )}
    </div>
  );
}

export function RoomScreen() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const { room, selfUserId, startedSession, closedInfo, error } = useRoomStore();
  const [joinAttempted, setJoinAttempted] = useState(false);

  useEffect(() => {
    ensureRoomSocketReady();
  }, []);

  useEffect(() => {
    if (!code) return;
    if (!room || room.code !== code.toUpperCase()) {
      if (!joinAttempted) {
        setJoinAttempted(true);
        joinRoom(code);
      }
    }
  }, [code, room, joinAttempted]);

  if (closedInfo && closedInfo.code === code?.toUpperCase()) {
    return (
      <div className="px-4 pt-10 text-center">
        <p className="text-white font-semibold mb-2">
          {closedInfo.reason === 'kicked' ? 'You were removed from the room.' : 'This room has closed.'}
        </p>
        <Link to="/room" className="text-gold text-sm">
          Back to Play with Friends
        </Link>
      </div>
    );
  }

  if (!room || room.code !== code?.toUpperCase()) {
    return (
      <div className="px-4 pt-10 text-center text-sm text-gray-400">
        {error ? error.message : 'Joining room…'}
      </div>
    );
  }

  // 'finished' keeps rendering the same table too — Four Card's rematch flow
  // (see RoomManager.closeRoomAfterGame) leaves a room in that status with
  // the same seats still live, and the table's own end screen (with its
  // "Play Again" button) is what the player should see, not the lobby.
  if (startedSession && (room.status === 'in_progress' || room.status === 'finished')) {
    if (room.gameKey === 'teen-patti') {
      return <TeenPattiTable gameSessionId={startedSession.gameSessionId} />;
    }
    if (room.gameKey === 'four-card') {
      return <FourCardTable gameSessionId={startedSession.gameSessionId} />;
    }
    return <GameSessionPlaceholder session={startedSession} room={room} />;
  }

  const self = room.players.find((p) => p.userId === selfUserId);
  const isHost = self?.isHost ?? false;
  const allReady = room.players.length > 0 && room.players.every((p) => p.isReady);
  const validCount = room.players.length >= room.minPlayers && room.players.length <= room.maxPlayers;

  return (
    <div className="px-4 pt-4">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-xl font-display font-bold text-white">Room {room.code}</h1>
        <span className="text-xs text-gray-400">
          {room.players.length}/{room.maxPlayers} players
        </span>
      </div>
      <p className="text-xs text-gray-400 mb-4">
        Share code <span className="text-gold font-semibold tracking-widest">{room.code}</span> with
        friends to join.
      </p>

      <LanQrPanel code={room.code} />

      <ul className="space-y-2 mb-4">
        {room.players.map((p) => (
          <PlayerRow
            key={p.userId}
            player={p}
            isSelf={p.userId === selfUserId}
            canKick={isHost && p.userId !== selfUserId}
            onKick={() => kickPlayer(room.code, p.userId)}
          />
        ))}
      </ul>

      {error && <p className="text-xs text-red-400 mb-4">{error.message}</p>}

      {room.rematchRequestedBy ? (
        <RematchBanner room={room} self={self} />
      ) : (
        <>
          <div className="flex gap-3">
            <button
              onClick={() => setReady(room.code, !self?.isReady)}
              className={[
                'flex-1 min-h-[44px] rounded-lg font-semibold py-3',
                self?.isReady ? 'bg-felt-light/60 border border-gold/20 text-gray-200' : 'bg-gold text-felt-dark',
              ].join(' ')}
            >
              {self?.isReady ? 'Not Ready' : "I'm Ready"}
            </button>
            {isHost && (
              <button
                onClick={() => startGame(room.code)}
                disabled={!allReady || !validCount}
                className="flex-1 min-h-[44px] rounded-lg bg-emerald-500 text-felt-dark font-semibold py-3 disabled:opacity-40"
              >
                Start Game
              </button>
            )}
          </div>
          {isHost && !validCount && (
            <p className="text-[11px] text-gray-500 mt-2 text-center">
              Needs {room.minPlayers}-{room.maxPlayers} players to start.
            </p>
          )}
        </>
      )}

      {room.gameHistory.length > 0 && (
        <div className="mt-4 rounded-xl bg-felt-light/30 border border-gold/10 p-3">
          <p className="text-[11px] text-gray-400 uppercase tracking-wide mb-2">This room's games</p>
          <ul className="space-y-1">
            {room.gameHistory.map((g, i) => (
              <li key={g.gameSessionId} className="text-[11px] text-gray-300">
                Game #{i + 1}: {Object.entries(g.scores).map(([id, score]) => `${id} ${score}`).join(' · ')}
              </li>
            ))}
          </ul>
        </div>
      )}

      <button
        onClick={() => {
          leaveRoom(room.code);
          navigate('/room');
        }}
        className="w-full min-h-[44px] mt-4 text-sm text-red-400"
      >
        Leave Room
      </button>
    </div>
  );
}
