export function RiEmptyState({ title, detail }: { title: string; detail?: string }) {
  return (
    <div className="fg-card fg-empty-state">
      <p className="fg-empty-state__title">{title}</p>
      {detail ? <p className="fg-muted">{detail}</p> : null}
    </div>
  );
}
