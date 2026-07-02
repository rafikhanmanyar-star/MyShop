import React from 'react';
import { NavLink, useLocation, useSearchParams } from 'react-router-dom';
import {
  defaultMobileModuleId,
  isMobileModuleId,
  mobileModulesForRole,
  type MobileModuleId,
} from './mobileOverviewModules';

type Props = {
  role: string;
};

export default function MobileBottomNav({ role }: Props) {
  const [searchParams] = useSearchParams();
  const { pathname } = useLocation();
  const onOverview = pathname === '/';
  const modules = mobileModulesForRole(role);
  const tabParam = searchParams.get('tab');
  const currentTab: MobileModuleId = isMobileModuleId(tabParam, role)
    ? tabParam
    : defaultMobileModuleId(role);

  if (modules.length === 0) return null;

  const moduleTabClass = (active: boolean) =>
    `relative flex min-w-[4.5rem] shrink-0 flex-col items-center gap-1 rounded-xl px-2.5 py-2 text-[0.625rem] font-semibold transition-all ${
      active
        ? 'bg-[#4A90E2] text-white shadow-md shadow-[#4A90E2]/25'
        : 'text-[#6C757D] active:scale-95 dark:text-muted-foreground'
    }`;

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 rounded-t-2xl border-t border-gray-200/90 bg-white/98 shadow-[0_-4px_24px_rgba(0,0,0,0.08)] backdrop-blur-md dark:border-gray-700 dark:bg-card/98 dark:shadow-[0_-4px_24px_rgba(0,0,0,0.35)]"
      aria-label="Mobile navigation"
    >
      <div className="mx-auto max-w-lg px-1 pt-1">
        <div className="overflow-x-auto pb-[max(0.5rem,env(safe-area-inset-bottom))] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="flex min-w-min items-end gap-1 px-1.5 py-1">
            {modules.map((mod) => {
              const active = onOverview && currentTab === mod.id;
              const Icon = mod.icon;
              return (
                <NavLink
                  key={mod.id}
                  to={`/?tab=${mod.id}`}
                  end
                  className={moduleTabClass(active)}
                  aria-current={active ? 'page' : undefined}
                >
                  <Icon className="h-[1.35rem] w-[1.35rem] shrink-0" strokeWidth={active ? 2.25 : 2} />
                  <span className="max-w-[4.75rem] truncate leading-none">{mod.shortLabel}</span>
                </NavLink>
              );
            })}
          </div>
        </div>
      </div>
    </nav>
  );
}
