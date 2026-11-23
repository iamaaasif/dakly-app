export function ResendLine({
  seconds,
  pending,
  onResend,
}: {
  seconds: number;
  pending: boolean;
  onResend: () => void;
}) {
  return (
    <p className="flex flex-wrap justify-center gap-1.5 text-sm">
      Didn’t get it?
      {seconds === 0 ? (
        <button
          type="button"
          onClick={onResend}
          disabled={pending}
          className="font-semibold text-action"
        >
          Send a new code
        </button>
      ) : (
        <span className="text-text-muted">
          You can resend in 0:{String(seconds).padStart(2, '0')}
        </span>
      )}
    </p>
  );
}
