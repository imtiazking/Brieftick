export function RiAiPlaceholder({
  title,
  phase = 'Phase 8',
}: {
  title: string;
  phase?: string;
}) {
  return (
    <div className="fg-card fg-ai-placeholder">
      <h3>{title}</h3>
      <p className="fg-muted">COMING IN {phase.toUpperCase()} — AI capability not yet enabled. No Design Lab AI fixtures are shown.</p>
    </div>
  );
}
