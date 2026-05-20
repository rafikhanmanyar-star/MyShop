type SectionHeadingProps = {
  level: 'h1' | 'h2' | 'hidden';
  id?: string;
  title: string;
  description?: string;
  align?: 'left' | 'center';
  titleClassName?: string;
  descriptionClassName?: string;
};

export default function SectionHeading({
  level,
  id,
  title,
  description,
  align = 'left',
  titleClassName = 'text-3xl font-bold text-text-dark sm:text-4xl',
  descriptionClassName = 'mt-3 text-muted',
}: SectionHeadingProps) {
  if (level === 'hidden') return null;

  const alignClass = align === 'center' ? 'mx-auto max-w-2xl text-center' : '';
  const Tag = level;

  return (
    <div className={alignClass}>
      <Tag id={id} className={titleClassName}>
        {title}
      </Tag>
      {description ? <p className={descriptionClassName}>{description}</p> : null}
    </div>
  );
}
