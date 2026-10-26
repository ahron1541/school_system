import { useState } from 'react';
import { Maximize, Moon, Sun, ScanLine } from 'lucide-react';
import { useGateStream as useGuardState } from './useGateStream';
import ScanIdentity from './ScanIdentity';
import { IdentitySkeleton } from './GuardSkeleton';
import BrandLogo from '../../shared/components/BrandLogo';

export default function ScanDisplay({ theme, toggleTheme }) {
  const { data, loading, error } = useGuardState(true);
  const [screenError, setScreenError] = useState('');
  async function fullscreen() {
    try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); setScreenError(''); }
    catch { setScreenError('Full screen is unavailable in this browser.'); }
  }
  return <div className="scan-display"><header><span className="display-brand"><BrandLogo/>CvSU Imus</span><div className="display-tools"><button className="icon-button" aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'} title="Change appearance" onClick={toggleTheme}>{theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}</button><button className="icon-button" aria-label="Toggle full screen" title="Full screen" onClick={fullscreen}><Maximize size={20} /></button></div></header>
    <main>{screenError && <p role="alert">{screenError}</p>}{loading ? <IdentitySkeleton /> : error ? <div className="scan-idle" role="alert"><h1>Display unavailable</h1><p>Waiting for the local server connection.</p></div> : data.semesterConfigured===false&&!data.scan ? <div className="scan-idle" role="status"><h1>School setup incomplete</h1><p>The administrator must set the current semester.</p></div> : <ScanIdentity scan={data.scan} connection={data.device.connection} publicDisplay />}</main>
    <footer><span>School gate</span><span>{error ? 'Connection unavailable' : data?.device.connection === 'online' ? 'Reader online' : data?.device.connection === 'degraded' ? 'Reader needs attention' : data?.device.connection === 'offline' ? 'Reader disconnected' : 'Reader not seen'}</span></footer>
  </div>;
}
