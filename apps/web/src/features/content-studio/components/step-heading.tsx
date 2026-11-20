export function StepHeading({ step, children }: { step: number; children: string }) {
  return (
    <h2 className="flex items-center gap-2 text-base font-semibold">
      <span
        aria-hidden="true"
        className="grid size-6 place-items-center rounded-full bg-inverse text-sm text-on-primary"
      >
        {step}
      </span>
      {children}
    </h2>
  );
}
