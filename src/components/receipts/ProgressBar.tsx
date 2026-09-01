type ProgressBarProps = {
  label: string;
  percent: number;
};

export function ProgressBar({ label, percent }: ProgressBarProps) {
  const width = Math.min(100, Math.max(0, percent));

  return (
    <div className="space-y-2" role="status" aria-live="polite">
      <p className="text-sm font-medium">{label}</p>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-300"
          style={{ width: `${width}%` }}
        />
      </div>
    </div>
  );
}
