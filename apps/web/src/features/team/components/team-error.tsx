export function TeamError({ message }: { message?: string }) {
  return message ? (
    <p role="alert" className="text-danger">
      {message}
    </p>
  ) : null;
}
