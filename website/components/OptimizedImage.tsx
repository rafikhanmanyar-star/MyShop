import Image, { type ImageProps } from 'next/image';

type OptimizedImageProps = Omit<ImageProps, 'alt'> & {
  alt: string;
};

/**
 * Next.js Image with lazy loading, compression, and stable dimensions to prevent CLS.
 */
export default function OptimizedImage({
  alt,
  quality = 82,
  loading,
  priority,
  sizes,
  placeholder = 'empty',
  ...props
}: OptimizedImageProps) {
  return (
    <Image
      alt={alt}
      quality={quality}
      priority={priority}
      placeholder={placeholder}
      loading={priority ? undefined : loading ?? 'lazy'}
      sizes={sizes ?? '(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw'}
      {...props}
    />
  );
}
