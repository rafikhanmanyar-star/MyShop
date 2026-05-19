import { siteConfig } from '../config/site';

export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-zinc-800 bg-zinc-950 text-zinc-400">
      <div className="section-pad py-12">
        <div className="flex flex-col gap-8 sm:flex-row sm:justify-between">
          <div>
            <div className="flex items-center gap-2 font-semibold text-white">
              <img src="/icons/icon-192.png" alt="" className="h-8 w-8 rounded-lg" />
              {siteConfig.brandName}
            </div>
            <p className="mt-2 max-w-xs text-sm">
              Order groceries and essentials online with delivery tracking and loyalty rewards.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-8 text-sm sm:grid-cols-3">
            <div>
              <p className="font-semibold text-white">Shop</p>
              <ul className="mt-3 space-y-2">
                <li>
                  <a href={siteConfig.shopOrderUrl} className="hover:text-white">
                    Order online
                  </a>
                </li>
                <li>
                  <a href={siteConfig.shopProductsUrl} className="hover:text-white">
                    Products
                  </a>
                </li>
                <li>
                  <a href={siteConfig.shopOffersUrl} className="hover:text-white">
                    Offers
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <p className="font-semibold text-white">Apps</p>
              <ul className="mt-3 space-y-2">
                <li>
                  <a href={siteConfig.posAppUrl} className="hover:text-white">
                    MyShop POS
                  </a>
                </li>
                <li>
                  <a href={siteConfig.riderAppUrl} className="hover:text-white">
                    OBO RIDER
                  </a>
                </li>
              </ul>
            </div>
          </div>
        </div>
        <p className="mt-10 border-t border-zinc-800 pt-6 text-center text-xs text-zinc-500">
          © {year} {siteConfig.brandName}. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
