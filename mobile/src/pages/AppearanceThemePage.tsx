import { Link, useParams } from 'react-router-dom';
import { useTheme, type ThemePreference } from '../theme';

type Option = {
  id: ThemePreference;
  title: string;
  description: string;
  preview: 'system' | 'light' | 'dark';
};

const OPTIONS: Option[] = [
  {
    id: 'system',
    title: 'System Default',
    description: 'Follow your device light or dark setting',
    preview: 'system',
  },
  {
    id: 'light',
    title: 'Light Mode',
    description: 'Bright backgrounds and soft shadows',
    preview: 'light',
  },
  {
    id: 'dark',
    title: 'Dark Mode',
    description: 'Dark surfaces, easier on OLED screens',
    preview: 'dark',
  },
];

function PreviewCard({ variant }: { variant: 'system' | 'light' | 'dark' }) {
  return (
    <div className={`appearance-preview appearance-preview--${variant}`} aria-hidden>
      <div className="appearance-preview__bar" />
      <div className="appearance-preview__row">
        <div className="appearance-preview__chip" />
        <div className="appearance-preview__chip appearance-preview__chip--wide" />
      </div>
      <div className="appearance-preview__card">
        <div className="appearance-preview__thumb" />
        <div className="appearance-preview__lines">
          <div className="appearance-preview__line" />
          <div className="appearance-preview__line appearance-preview__line--short" />
        </div>
      </div>
    </div>
  );
}

export default function AppearanceThemePage() {
  const { shopSlug } = useParams();
  const { preference, resolved, setPreference } = useTheme();

  if (!shopSlug) return null;

  const base = `/${shopSlug}`;

  return (
    <div className="page fade-in appearance-theme-page" style={{ paddingBottom: 100 }}>
      <Link to={`${base}/utilities`} className="appearance-theme-back" aria-label="Back to utilities">
        <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M15 18l-6-6 6-6" />
        </svg>
      </Link>

      <h1 className="appearance-theme-title">Appearance &amp; Theme</h1>
      <p className="appearance-theme-subtitle">
        Choose light, dark, or match your Android system setting. Currently using{' '}
        <strong>{resolved === 'dark' ? 'Dark' : 'Light'}</strong>
        {preference === 'system' ? ' (system)' : ''}.
      </p>

      <div className="appearance-theme-options" role="radiogroup" aria-label="Theme preference">
        {OPTIONS.map((opt) => {
          const selected = preference === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              role="radio"
              aria-checked={selected}
              className={`appearance-theme-option${selected ? ' appearance-theme-option--selected' : ''}`}
              onClick={() => setPreference(opt.id)}
            >
              <span className="appearance-theme-option__radio" aria-hidden>
                {selected ? '●' : '○'}
              </span>
              <span className="appearance-theme-option__body">
                <span className="appearance-theme-option__title">{opt.title}</span>
                <span className="appearance-theme-option__desc">{opt.description}</span>
              </span>
              <PreviewCard variant={opt.preview} />
            </button>
          );
        })}
      </div>

      <p className="appearance-theme-hint">
        Theme preference is saved on this device and restored after app updates.
      </p>
    </div>
  );
}
