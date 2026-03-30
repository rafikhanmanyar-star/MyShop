import React from 'react';

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  enableSpellCheck?: boolean;
}

const Textarea: React.FC<TextareaProps> = ({ label, id, name, enableSpellCheck = true, ...props }) => {
  // Mobile: py-3 and text-base to prevent zoom and increase touch area
  // Desktop: py-2 and text-sm for compactness
  const finalClassName = `input block w-full px-3 py-3 sm:py-2 rounded-lg shadow-sm text-base sm:text-sm disabled:cursor-not-allowed focus:ring-2 focus:ring-primary/40 focus:border-primary transition-colors`;

  // Generate an id if not provided (for accessibility)
  const textareaId = id || `textarea-${name || label.toLowerCase().replace(/\s+/g, '-')}`;

  return (
    <div>
      <label htmlFor={textareaId} className="label mb-1 block">
        {label}
      </label>
      <textarea
        {...props}
        id={textareaId}
        name={name || textareaId}
        rows={3}
        className={finalClassName}
        autoComplete={props.autoComplete || "off"}
        autoCorrect={enableSpellCheck ? "on" : "off"}
        spellCheck={enableSpellCheck}
      />
    </div>
  );
};

export default Textarea;
