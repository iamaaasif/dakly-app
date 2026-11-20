type HubNoticeProps = { message: string };

export function HubNotice({ message }: HubNoticeProps) {
  return (
    <p role="status" className="rounded-md bg-success-soft p-3 text-sm text-success">
      {message}
    </p>
  );
}
