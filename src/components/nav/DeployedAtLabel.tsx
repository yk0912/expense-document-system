import { deployedAtLabel } from "@/lib/deployed-at";

export function DeployedAtLabel({ className }: { className?: string }) {
  const label = deployedAtLabel();
  if (!label) {
    return null;
  }
  return <p className={className}>{label}</p>;
}
