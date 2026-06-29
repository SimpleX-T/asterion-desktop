interface PageHeaderProps {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
}

export function PageHeader({ eyebrow, title, subtitle, children }: PageHeaderProps) {
  return (
    <div className="flex items-end justify-between gap-4 border-b border-asterion-border px-10 py-8">
      <div>
        {eyebrow && (
          <div className="mb-2 font-mono text-[10px] tracking-label text-asterion-muted">
            {eyebrow}
          </div>
        )}
        <h1 className="font-serif text-3xl font-light text-asterion-text">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-asterion-muted">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}
