export function RevenueSparkline({ points }: { points: string[] }) {
  const values = points.map(Number);
  if (values.length < 2) return null;
  const max = Math.max(1, ...values);
  const trend = values
    .map((value, index) => `${(index * 100) / (values.length - 1)},${38 - (value / max) * 36}`)
    .join(' ');
  return (
    <svg
      aria-hidden
      viewBox="0 0 100 40"
      preserveAspectRatio="none"
      className="h-16 min-w-32 flex-1 text-primary"
    >
      <polygon points={`0,40 ${trend} 100,40`} fill="currentColor" opacity="0.15" />
      <polyline
        points={trend}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
