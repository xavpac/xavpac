type TrendSparklineProps = {
  values: number[];
  label: string;
  className?: string;
};

export default function TrendSparkline({ values, label, className }: TrendSparklineProps) {
  const finiteValues = values.filter(Number.isFinite);
  if (finiteValues.length < 2) return null;

  const width = 180;
  const height = 48;
  const padding = 4;
  const minimum = Math.min(...finiteValues);
  const maximum = Math.max(...finiteValues);
  const range = Math.max(1, maximum - minimum);
  const points = finiteValues.map((value, index) => {
    const x = padding + (index / (finiteValues.length - 1)) * (width - padding * 2);
    const y = padding + ((maximum - value) / range) * (height - padding * 2);
    return [x, y] as const;
  });
  const line = points.map(([x, y], index) => `${index ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const area = `${line} L${points.at(-1)?.[0] ?? width - padding} ${height - padding} L${padding} ${height - padding} Z`;

  return (
    <svg className={className} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label} preserveAspectRatio="none">
      <path d={area} fill="currentColor" opacity=".12" />
      <path d={line} fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      {points.map(([x, y], index) => <circle key={`${x}-${y}`} cx={x} cy={y} r={index === points.length - 1 ? 3.2 : 1.7} fill="currentColor" />)}
    </svg>
  );
}
