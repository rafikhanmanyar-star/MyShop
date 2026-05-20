import OptimizedImage from '@/components/OptimizedImage';
import { siteImages } from '@/lib/images';

export default function PhoneMockup() {
  const hero = siteImages.heroPwaOrdering;
  const tracking = siteImages.trackingFeature;

  return (
    <figure className="relative mx-auto w-full max-w-[320px] lg:max-w-[360px]">
      <div
        className="absolute -left-4 top-8 z-10 hidden w-44 overflow-hidden rounded-2xl border border-border bg-white shadow-card sm:block lg:-left-16"
        aria-hidden="true"
      >
        <OptimizedImage
          src={tracking.src}
          alt=""
          width={tracking.width}
          height={tracking.height}
          sizes="176px"
          className="h-auto w-full"
        />
      </div>

      <div className="relative rotate-[-4deg] rounded-[2.5rem] border-[10px] border-text-dark bg-text-dark p-1 shadow-card-lg">
        <OptimizedImage
          src={hero.src}
          alt={hero.alt}
          width={hero.width}
          height={hero.height}
          priority
          fetchPriority="high"
          sizes="(max-width: 1024px) 280px, 360px"
          className="h-auto w-full rounded-[2rem]"
        />
      </div>

      <figcaption className="sr-only">{hero.alt}</figcaption>
    </figure>
  );
}
