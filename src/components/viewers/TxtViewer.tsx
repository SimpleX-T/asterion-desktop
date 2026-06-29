import { useMemo } from "react";

export function TxtViewer({ bytes, markdown }: { bytes: Uint8Array; markdown?: boolean }) {
  const text = useMemo(() => new TextDecoder("utf-8").decode(bytes), [bytes]);
  const blocks = useMemo(
    () =>
      text
        .split(/\r?\n\r?\n+/)
        .map((b) => b.replace(/\r/g, "").trim())
        .filter(Boolean),
    [text],
  );

  return (
    <div className="mx-auto max-w-3xl px-8 py-12 font-serif text-[18px] leading-[1.85] text-asterion-text">
      {blocks.map((b, i) => (
        <p key={i} className={markdown ? "mb-4 whitespace-pre-wrap" : "mb-5 whitespace-pre-wrap"}>
          {b}
        </p>
      ))}
    </div>
  );
}
