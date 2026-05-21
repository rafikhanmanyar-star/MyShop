import OptimizedImage from '@/components/OptimizedImage';
import { siteImages } from '@/lib/images';

export default function PhoneMockup() {
  const hero = siteImages.heroAppMockup;

  return (
    <figure className="relative mx-auto w-full max-w-[560px] lg:max-w-[680px]">
      <OptimizedImage
        src={hero.src}
        alt={hero.alt}
        width={hero.width}
        height={hero.height}
        priority
        unoptimized
        fetchPriority="high"
        sizes="(max-width: 1024px) 92vw, 680px"
        className="h-auto w-full drop-shadow-[0_24px_48px_rgba(15,23,42,0.12)]"
      />
      <figcaption className="sr-only">{hero.alt}</figcaption>
    </figure>
  );
}
