import { useEffect, useState } from 'react';
import { Skeleton } from './Loading';

function ImageState({ src, alt, fallback, className }) {
  const [state, setState] = useState(src ? 'loading' : 'failed');
  useEffect(() => {
    if (state !== 'loading') return;
    const timeout = setTimeout(() => setState('failed'), 8000);
    return () => clearTimeout(timeout);
  }, [state]);
  return <span className={'photo-frame ' + className} aria-busy={state === 'loading' || undefined}>
    {state === 'loading' && <Skeleton className="photo-skeleton" />}
    {state !== 'failed' && <img src={src} alt={alt} className={state === 'loading' ? 'photo-pending' : 'photo-ready'} onLoad={() => setState('ready')} onError={() => setState('failed')} />}
    {state === 'failed' && <span className="photo-fallback">{fallback}</span>}
  </span>;
}

export default function Photo({ src, alt = '', fallback, className = '' }) {
  return <ImageState key={src || 'missing'} src={src} alt={alt} fallback={fallback} className={className} />;
}
