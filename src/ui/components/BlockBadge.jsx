export default function BlockBadge({ type, color }) {
  return (
    <span className="block-badge" style={{ "--badge-color": color }}>
      {type}
    </span>
  );
}
