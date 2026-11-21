import { useEffect, useState } from 'react';

// Codes can be sent again 30 seconds after the last one (ACC-R2 send limits still apply).
export function useResendCountdown(initial = 30) {
  const [seconds, setSeconds] = useState(initial);
  useEffect(() => {
    const interval = setInterval(() => setSeconds((left) => Math.max(0, left - 1)), 1000);
    return () => clearInterval(interval);
  }, []);
  return {
    seconds,
    label: seconds ? `Resend code in 0:${String(seconds).padStart(2, '0')}` : 'Resend code',
    restart: () => setSeconds(30),
  };
}
