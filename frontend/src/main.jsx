import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './app/App.jsx';
import './app/styles.css';
import './app/access.css';
import './features/guard/guard.css';
import './app/loading.css';

createRoot(document.getElementById('root')).render(<React.StrictMode><App /></React.StrictMode>);
