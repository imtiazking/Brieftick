export function RiStatusChip({ label }: { label: string }) {
  return <span className="fg-chip">{label.replaceAll('_', ' ')}</span>;
}
