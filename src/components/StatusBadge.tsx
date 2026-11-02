export default function StatusBadge({ submitted, locked }: { submitted: boolean; locked: boolean }) {
  if (locked) return <span className="badge bg-gray-200 text-gray-700">Locked</span>;
  if (submitted) return <span className="badge bg-green-100 text-green-800">Submitted</span>;
  return <span className="badge bg-amber-100 text-amber-800">Draft</span>;
}
