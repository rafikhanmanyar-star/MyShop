import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import { RiderProvider } from './context/RiderContext';
import { ToastProvider } from './context/ToastContext';
import './index.css';

registerSW({ immediate: true });

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <RiderProvider>
        <ToastProvider>
          <App />
        </ToastProvider>
      </RiderProvider>
    </BrowserRouter>
  </React.StrictMode>
);
