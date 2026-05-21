import { ArrowRight, ShoppingBasket } from '@/components/icons';
import InstallButton from '@/components/InstallButton';
import OptimizedImage from '@/components/OptimizedImage';
import SectionHeading from '@/components/SectionHeading';
import { siteConfig } from '@/lib/data';
import { siteImages } from '@/lib/images';

type FinalCTAProps = {
  headingLevel?: 'h1' | 'h2';
};

export default function FinalCTA({ headingLevel = 'h2' }: FinalCTAProps) {
  const orderQr = siteImages.scanToOrderQr;

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
                <SectionHeading
                  level={headingLevel}
                  id="install-pwa-heading"
                  title="Install oBo Store PWA"
                  description="Add our app to your home screen for fast reordering, live tracking, and the same low prices as our Main Boulevard store in FMC B-17."
                  titleClassName="text-2xl font-bold text-white sm:text-3xl lg:text-4xl"
                  descriptionClassName="mt-3 max-w-lg text-sm text-white/85 sm:text-base"
                />
                <p className="mt-4 text-sm text-white/90">
                  <a
                    href={siteConfig.shopUrl}
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-semibold text-white underline decoration-white/50 underline-offset-2 hover:decoration-white"
                  >
                    Open oBo Store app
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </a>
                </p>
              </div>
            </div>

            <div className="flex flex-col items-center gap-4 rounded-2xl bg-white/10 p-6 sm:min-w-[260px]">
              <h3 className="text-sm font-semibold text-white">Add to home screen</h3>
              <p className="text-xs text-white/75">Fast · Secure · Always with you</p>
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
