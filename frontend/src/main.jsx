import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import { applyStoredTheme } from './hooks/useTheme.js';
import './styles/tokens.css';
import './styles/app.css';

applyStoredTheme();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
