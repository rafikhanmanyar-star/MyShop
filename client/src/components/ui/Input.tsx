import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  helperText?: string;
  error?: string;
  enableSpellCheck?: boolean;
  icon?: React.ReactNode;
  horizontal?: boolean;
  compact?: boolean;
}

const Input: React.FC<InputProps> = ({
  label,
  id,
  helperText,
  error,
  onKeyDown,
  name,
  enableSpellCheck = true,
  icon,
  horizontal = false,
  compact = false,
  ...props
}) => {
  const spinnerRemovalClasses =
    `[appearance:textfield] [-moz-appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none`;

  const isNumberInput = props.type === 'number';
  const compactPad = compact ? 'py-1 px-2 text-xs' : 'input-text px-3 py-2';
  const baseClassName = `input block w-full tabular-nums ${compactPad} ${error ? 'border-destructive focus:ring-destructive/30' : ''}`;

  const finalClassName = props.className
    ? isNumberInput
      ? `${props.className} ${spinnerRemovalClasses}`
      : props.className
    : isNumberInput
      ? `${baseClassName} ${spinnerRemovalClasses}`
      : baseClassName;

  const inputId = id || (label ? `input-${name || label.toLowerCase().replace(/\s+/g, '-')}` : undefined);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (props.type === 'number' && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault();
    }
    if (onKeyDown) {
      onKeyDown(e);
    }
  };

  const shouldEnableSpellCheck =
    enableSpellCheck && !['number', 'email', 'password', 'tel', 'url'].includes(props.type || 'text');

  const inputElement = (
    <div className="relative w-full">
      {icon && (
        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-muted-foreground">
          {icon}
        </div>
      )}
      <input
        {...props}
        id={inputId}
        name={name || inputId}
        onKeyDown={handleKeyDown}
        className={`${finalClassName} ${icon ? 'pl-10' : ''}`}
        autoComplete={props.autoComplete || 'off'}
        autoCorrect={shouldEnableSpellCheck ? 'on' : 'off'}
        spellCheck={shouldEnableSpellCheck}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={
          (helperText || error) && inputId
            ? `${inputId}-${error ? 'error' : 'helper-text'}`
            : undefined
        }
      />
    </div>
  );

  const helperTextElement = helperText && !error ? (
    <p id={inputId ? `${inputId}-helper-text` : undefined} className="mt-1 text-xs text-muted-foreground">
      {helperText}
    </p>
  ) : null;

  const errorElement = error ? (
    <p id={inputId ? `${inputId}-error` : undefined} className="mt-1 text-xs font-medium text-destructive" role="alert">
      {error}
    </p>
  ) : null;

  if (!label) {
    return (
      <div>
        {inputElement}
        {errorElement}
        {helperTextElement}
      </div>
    );
  }

  if (horizontal) {
    return (
      <div className="flex items-center gap-2">
        <label htmlFor={inputId} className="w-24 shrink-0 text-xs font-bold uppercase tracking-wider text-muted-foreground">
          {label}
        </label>
        <div className="flex-1">
          {inputElement}
          {errorElement}
          {helperTextElement}
        </div>
      </div>
    );
  }

  return (
    <div>
      <label htmlFor={inputId} className="label mb-1.5 block">
        {label}
      </label>
      {inputElement}
      {errorElement}
      {helperTextElement}
    </div>
  );
};

export default Input;
