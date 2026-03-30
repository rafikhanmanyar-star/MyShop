import React from 'react';

export interface POSColumnResizeHandleProps {
    onMouseDown: (e: React.MouseEvent) => void;
    'aria-label'?: string;
}

/** Vertical drag handle between POS columns (tree / products / cart / checkout). */
export const POSColumnResizeHandle: React.FC<POSColumnResizeHandleProps> = ({
    onMouseDown,
    'aria-label': ariaLabel = 'Drag to resize column'
}) => (
    <div
        role="separator"
        aria-orientation="vertical"
        aria-label={ariaLabel}
        className="group relative w-1.5 shrink-0 flex items-center justify-center cursor-col-resize z-30 select-none touch-none hover:bg-slate-100/80 rounded-full"
        onMouseDown={onMouseDown}
    >
        <div className="absolute inset-y-3 w-px bg-slate-200 group-hover:w-0.5 group-hover:bg-blue-500 group-active:bg-blue-600 rounded-full transition-[width,background-color] duration-150" />
    </div>
);
