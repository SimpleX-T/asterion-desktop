// Deterministic fallback cover for novels without artwork: a per-title gradient
// with the title set in serif. Same title → same cover, so the grid is stable
// and each novel looks distinct.

const GRADIENTS: [string, string][] = [
  ["#1e3a8a", "#0b1220"], // indigo
  ["#155e63", "#06141a"], // teal
  ["#5b2333", "#180a10"], // wine
  ["#3f3270", "#120e22"], // violet
  ["#1f4d3a", "#08160f"], // forest
  ["#4a3b18", "#140f06"], // amber
  ["#2b3a55", "#0a1018"], // steel
  ["#5a2d4a", "#160913"], // plum
];

function hash(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function GeneratedCover({
  title,
  author,
  className = "",
}: {
  title: string;
  author?: string | null;
  className?: string;
}) {
  const [from, to] = GRADIENTS[hash(title) % GRADIENTS.length];
  return (
    <div
      className={`flex h-full w-full flex-col items-center justify-center px-3 text-center ${className}`}
      style={{ background: `linear-gradient(150deg, ${from}, ${to})` }}
    >
      <span
        className="font-serif font-semibold leading-tight text-white/90"
        style={{ fontSize: "clamp(13px, 1.6vw, 20px)", textShadow: "0 1px 8px rgba(0,0,0,0.5)" }}
      >
        {title}
      </span>
      {author && (
        <span className="mt-2 font-mono text-[9px] uppercase tracking-widest text-white/55">
          {author}
        </span>
      )}
    </div>
  );
}
