import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { RiderProvider } from './context/RiderContext';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <RiderProvider>
        <App />
      </RiderProvider>
    </BrowserRouter>
  </React.StrictMode>
);
