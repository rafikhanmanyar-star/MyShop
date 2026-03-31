import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { installSuppressNumberInputWheel } from './utils/suppressNumberInputWheel'
import './index.css'

installSuppressNumberInputWheel()

// When the app is installed (PWA standalone), the launch URL is often just "/" and the shop slug is lost.
// Redirect to the last used shop so the app can load inventories.
const LAST_SHOP_SLUG_KEY = 'myshop_last_shop_slug';
if (typeof window !== 'undefined') {
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches
        || !!(window.navigator as unknown as { standalone?: boolean }).standalone;
    const path = window.location.pathname.replace(/\/$/, '') || '/';
    if (isStandalone && path === '/') {
        try {
            const saved = localStorage.getItem(LAST_SHOP_SLUG_KEY);
            if (saved && /^[a-z0-9-]+$/.test(saved.trim())) {
                window.location.replace(`/${saved.trim()}`);
            }
        } catch { /* ignore */ }
    }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
)
