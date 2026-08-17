import { useEffect } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useConnectionStore } from '../../store/connectionStore';

/**
 * Landing point for a scanned LAN QR code: `/join/:code?server=<lan-ip>:<port>`.
 * Retargets this client's socket at the host device's LAN address *before*
 * anything tries to connect, then hands off to the normal room screen.
 */
export function JoinViaLink() {
  const { code } = useParams<{ code: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const setServerUrl = useConnectionStore((s) => s.setServerUrl);

  useEffect(() => {
    const server = searchParams.get('server');
    if (server) {
      const url = server.startsWith('http') ? server : `http://${server}`;
      setServerUrl(url);
    }
    if (code) navigate(`/room/${code.toUpperCase()}`, { replace: true });
  }, [code, searchParams, navigate, setServerUrl]);

  return <div className="px-4 pt-10 text-center text-sm text-gray-400">Connecting…</div>;
}
