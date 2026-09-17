import { createRoot } from 'react-dom/client';
import { Login } from '../src/Login.js';
import '../src/index.css';
if (new URLSearchParams(location.search).get('tema') === 'claro') localStorage.setItem('monitoring.tema', 'claro'); else localStorage.removeItem('monitoring.tema');
createRoot(document.getElementById('raiz')!).render(<Login alIngresar={() => {}} />);
