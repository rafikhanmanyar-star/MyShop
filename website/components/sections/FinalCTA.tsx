import InstallButton from '@/components/InstallButton';
import OptimizedImage from '@/components/OptimizedImage';
import { ShoppingBasket } from '@/components/icons';
import { siteImages } from '@/lib/images';

type FinalCTAProps = {
  headingLevel?: 'h1' | 'h2';
};

export default function FinalCTA({ headingLevel = 'h2' }: FinalCTAProps) {
  const orderQr = siteImages.scanToOrderQr;
  const HeadingTag = headingLevel;

  return (
    <section className="pb-16 sm:pb-20" aria-labelledby="install-pwa-heading">
      <div className="section-container">
        <div className="overflow-hidden rounded-3xl bg-gradient-to-br from-primary to-cta px-6 py-10 sm:px-10 sm:py-14">
          <div className="grid items-center gap-8 lg:grid-cols-[1fr_auto]">
            <div className="flex gap-6">
              <div className="hidden shrink-0 sm:flex">
                <div className="flex h-24 w-24 items-center justify-center rounded-2xl bg-white/15">
                  <ShoppingBasket className="h-12 w-12 text-white" aria-hidden="true" />
                </div>
              </div>
              <div>
                <HeadingTag
                  id="install-pwa-heading"
                  className="text-2xl font-bold text-white sm:text-3xl lg:text-4xl"
                >
                  Everything Your Home Needs — In One Smart App
                </HeadingTag>
                <p className="mt-3 max-w-lg text-sm text-white/85 sm:text-base">
                  Install oBo Store for fast reordering, live tracking, and the same low prices as
                  our Main Boulevard store in FMC B-17.
                </p>
              </div>
            </div>

            <div className="flex flex-col items-center gap-4 rounded-2xl bg-white/10 p-6 sm:min-w-[260px]">
              <h3 className="text-sm font-semibold text-white">Install as App (PWA)</h3>
              <InstallButton variant="white" className="w-full px-6 py-3" />
              <figure className="rounded-xl bg-white p-3 text-center">
                <OptimizedImage
                  src={orderQr.src}
                  alt={orderQr.alt}
                  width={orderQr.width}
                  height={orderQr.height}
                  sizes="120px"
                  className="mx-auto h-auto w-full max-w-[120px]"
                />
                <figcaption className="mt-2 text-xs font-medium text-text-dark">
                  Scan to Order Online
                </figcaption>
              </figure>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
