import { QrCode, ShoppingBasket } from '@/components/icons';
import InstallButton from '@/components/InstallButton';

export default function FinalCTA() {
  return (
    <section className="pb-16 sm:pb-20">
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
                <h2 className="text-2xl font-bold text-white sm:text-3xl lg:text-4xl">
                  Everything Your Home Needs — In One Smart App.
                </h2>
                <p className="mt-3 max-w-lg text-sm text-white/85 sm:text-base">
                  Install oBo Store now and experience smart shopping like never before.
                </p>
              </div>
            </div>

            <div className="flex flex-col items-center gap-4 rounded-2xl bg-white/10 p-6 sm:min-w-[260px]">
              <p className="text-sm font-semibold text-white">Install as App (PWA)</p>
              <p className="text-xs text-white/75">Fast · Secure · Always with you</p>
              <InstallButton variant="white" className="w-full px-6 py-3" />
              <div
                className="flex h-24 w-24 items-center justify-center rounded-xl bg-white"
                aria-label="QR code to install oBo Store PWA"
              >
                <QrCode className="h-16 w-16 text-text-dark" aria-hidden="true" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
