import type { ReactNode } from 'react';

type Props = {
  title?: string;
  children: ReactNode;
  className?: string;
};

/** Fixed bottom panel (mobile-style); content scrolls inside. */
export function BottomSheetPanel({ title, children, className = '' }: Props) {
  return (
    <div className={`bottom-sheet bottom-sheet--obo ${className}`.trim()}>
      <div className="bottom-sheet__handle" aria-hidden />
      {title ? <h2 className="bottom-sheet__title">{title}</h2> : null}
      <div className="bottom-sheet__body">{children}</div>
    </div>
  );
}
