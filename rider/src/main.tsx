import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import { RiderProvider } from './context/RiderContext';
import { ToastProvider } from './context/ToastContext';
import { queryClient } from './lib/queryClient';
import './index.css';
import './theme-enterprise.css';

registerSW({ immediate: true });

document.body.classList.add('rider-enterprise');

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <RiderProvider>
          <ToastProvider>
            <App />
          </ToastProvider>
        </RiderProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>
);
