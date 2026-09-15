import type { CSSProperties, ReactNode } from 'react';

export function Sheet({ title, note, children }: { title: string; note?: ReactNode; children: ReactNode }) {
  return (
    <section className="sheet">
      <div className="sheet-head">
        <span>{title}</span>
        {note ? <em>{note}</em> : null}
      </div>
      {children}
    </section>
  );
}

export function Meter({ value, goal }: { value: number; goal: number }) {
  const done = value >= goal;
  const pct = goal > 0 ? Math.min(100, (value / goal) * 100) : 0;
  return (
    <div className="meter" data-done={done ? '1' : '0'}>
      <span style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Rows({ children, tight }: { children: ReactNode; tight?: boolean }) {
  return <div className={tight ? 'rows tight' : 'rows'}>{children}</div>;
}

export function Row({
  label,
  value,
  total,
  meter,
  rest,
  done,
}: {
  label: ReactNode;
  value: number;
  total: number;
  meter?: boolean;
  rest?: ReactNode;
  done?: boolean;
}) {
  const complete = done ?? value >= total;
  return (
    <div className="row" data-done={complete ? '1' : '0'}>
      <div className="row-label">
        {typeof label === 'string' ? <span className="row-text">{label}</span> : label}
      </div>
      <div className="row-value">
        <span className="now">{value}</span>
        <span className="of">/{total}</span>
      </div>
      <div>{meter === false ? null : <Meter value={value} goal={total} />}</div>
      {rest !== undefined ? <div className="row-rest">{rest}</div> : null}
    </div>
  );
}

export function Cells({
  children,
  size = 40,
  gap = 5,
  columns = 0,
}: {
  children: ReactNode;
  size?: number;
  gap?: number;
  columns?: number;
}) {
  const style = {
    '--tile': `${size}px`,
    '--gap': `${gap}px`,
    gridTemplateColumns: columns > 0 ? `repeat(${columns}, var(--tile))` : undefined,
  } as CSSProperties;
  return (
    <div className="cells" style={style}>
      {children}
    </div>
  );
}

export function Cell({
  src,
  title,
  on,
  fresh,
  size,
}: {
  src: string;
  title: string;
  on: boolean;
  fresh?: boolean;
  size?: number;
}) {
  const style = size ? ({ '--tile': `${size}px` } as CSSProperties) : undefined;
  return (
    <div className={fresh ? 'cell fresh' : 'cell'} data-on={on ? '1' : '0'} title={title} style={style}>
      <img src={src} alt={title} loading="lazy" draggable={false} />
    </div>
  );
}

export function Void({ children }: { children: ReactNode }) {
  return <div className="void-line">{children}</div>;
}
