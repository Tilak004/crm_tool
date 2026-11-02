import { formatPaise } from "@/lib/gst";

/** Shows how a payment mode's entered amount compares with its item total. */
export default function CheckCell({ diffPaise }: { diffPaise: number | null }) {
  if (diffPaise === null) return <span className="text-gray-400">—</span>;
  if (diffPaise === 0) return <span className="text-green-700">✓ Matches items</span>;
  return (
    <span className="text-amber-700">
      ⚠ {diffPaise > 0 ? "More" : "Less"} than items by {formatPaise(Math.abs(diffPaise))}
    </span>
  );
}
