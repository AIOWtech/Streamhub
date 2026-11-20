import React from 'react';
import { createRoot } from 'react-dom/client';
import '@livekit/components-styles';
import App from './ui.jsx';
import BackendLayer from './backend.jsx';
import './style.css';
createRoot(document.getElementById('root')).render(<React.StrictMode><><App /><BackendLayer /></></React.StrictMode>);