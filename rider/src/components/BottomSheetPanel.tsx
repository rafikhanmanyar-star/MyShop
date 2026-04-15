import type { ReactNode } from 'react';

type Props = {
  title?: string;
  children: ReactNode;
};

/** Fixed bottom panel (mobile-style); content scrolls inside. */
export function BottomSheetPanel({ title, children }: Props) {
  return (
    <div className="bottom-sheet">
      <div className="bottom-sheet__handle" aria-hidden />
      {title ? <h2 className="bottom-sheet__title">{title}</h2> : null}
      <div className="bottom-sheet__body">{children}</div>
    </div>
  );
}
