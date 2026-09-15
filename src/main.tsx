import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App';
import { Overlay } from './Overlay';
import './styles.css';

const isOverlay = location.pathname.replace(/\/+$/, '').endsWith('/overlay');

createRoot(document.getElementById('root')!).render(
  <StrictMode>{isOverlay ? <Overlay /> : <App />}</StrictMode>,
);
