import { useState } from 'react';
import { Maximize, Moon, Sun, ScanLine } from 'lucide-react';
import { useGuardState } from './useGuardState';
import ScanIdentity from './ScanIdentity';
import { IdentitySkeleton } from './GuardSkeleton';

export default function ScanDisplay({ theme, toggleTheme }) {
  const { data, loading, error } = useGuardState(true);
  const [screenError, setScreenError] = useState('');
  async function fullscreen() {
    try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); setScreenError(''); }
    catch { setScreenError('Full screen is unavailable in this browser.'); }
  }
  return <div className="scan-display"><header><span className="display-brand"><ScanLine size={24} />Gatehouse</span><div className="display-tools"><button className="icon-button" aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'} title="Change appearance" onClick={toggleTheme}>{theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}</button><button className="icon-button" aria-label="Toggle full screen" title="Full screen" onClick={fullscreen}><Maximize size={20} /></button></div></header>
    <main>{screenError && <p role="alert">{screenError}</p>}{loading ? <IdentitySkeleton /> : error ? <div className="scan-idle" role="alert"><h1>Display unavailable</h1><p>Waiting for the local server connection.</p></div> : <ScanIdentity scan={data.scan} publicDisplay />}</main>
    <footer><span>School gate</span><span>{error ? 'Connection unavailable' : data?.device.connection === 'online' ? 'Reader online' : data?.device.connection === 'offline' ? 'Reader disconnected' : 'Reader not seen'}</span></footer>
  </div>;
}
