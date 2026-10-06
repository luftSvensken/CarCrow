import React from 'react';
import {createRoot} from 'react-dom/client';
import App from './App';
import './style.css';
const theme=localStorage.getItem('theme')||'system';
const dark=theme==='dark'||theme==='system'&&matchMedia('(prefers-color-scheme: dark)').matches;
document.documentElement.dataset.theme=dark?'dark':'light';
document.documentElement.style.colorScheme=dark?'dark':'light';
createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);
