import QRCode from 'qrcode';
import { useEffect, useState } from 'react';

interface QrCodeProps {
  value: string;
  size?: number;
}

/** Client-side QR generation only — no network call, so this works over LAN with no internet. */
export function QrCode({ value, size = 200 }: QrCodeProps) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(value, { width: size, margin: 1, color: { dark: '#0b3d2e', light: '#fdfbf5' } })
      .then((url) => {
        if (!cancelled) setDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setDataUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [value, size]);

  if (!dataUrl) {
    return (
      <div
        className="rounded-lg bg-white/90 animate-pulse"
        style={{ width: size, height: size }}
        aria-hidden
      />
    );
  }

  return (
    <img
      src={dataUrl}
      width={size}
      height={size}
      alt="Scan to join this room"
      className="rounded-lg bg-white p-2"
    />
  );
}
