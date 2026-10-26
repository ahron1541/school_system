import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './app/App.jsx';
import ConfirmProvider from './shared/components/ConfirmProvider';
import './app/styles.css';
import './app/access.css';
import './features/guard/guard.css';
import './app/loading.css';
import './app/modals.css';
import './app/polish.css';

createRoot(document.getElementById('root')).render(<React.StrictMode><ConfirmProvider><App /></ConfirmProvider></React.StrictMode>);
