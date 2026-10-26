import { useEffect, useId, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { useUnloadWarning } from '../hooks/useFormDraft';

export default function Modal({ title, closeLabel, onClose, busy = false, dirty = false, lossWarning = '', formId, onSubmit, footer, children, compact = false, className = '' }) {
  const dialog = useRef(null);
  const titleId = useId();
  const [confirmClose, setConfirmClose] = useState(false);
  const close = () => { if (busy) return; if (lossWarning) setConfirmClose(true); else onClose(); };
  function trapFocus(event) {
    if(event.key!=='Tab')return;
    const controls=[...dialog.current.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href],[tabindex="0"]')].filter(element=>element.getClientRects().length);
    if(!controls.length){event.preventDefault();dialog.current.focus();return;}
    const first=controls[0],last=controls.at(-1);
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
  }
  useUnloadWarning(dirty || busy);
  useEffect(() => {
    const element = dialog.current;
    const previous = document.activeElement;
    const overflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    element.showModal();
    return () => { element.close(); document.documentElement.style.overflow = overflow; if (previous?.isConnected) previous.focus(); };
  }, []);
  const contents = <><div className="modal-body">{children}</div>{footer && <footer className="modal-footer">{confirmClose ? <><p className="close-warning" role="alert">{lossWarning}</p><button type="button" className="button" autoFocus onClick={() => setConfirmClose(false)}>Keep editing</button><button type="button" className="button" onClick={onClose}>Close anyway</button></> : typeof footer === 'function' ? footer({ close }) : footer}</footer>}</>;
  return <dialog ref={dialog} onKeyDown={trapFocus} className={'student-dialog app-modal' + (compact ? ' modal-compact' : '') + ' ' + className} aria-labelledby={titleId} onCancel={(event) => { event.preventDefault(); close(); }}>
    <header className="modal-header"><h2 id={titleId}>{title}</h2><button type="button" className="icon-button" aria-label={closeLabel || 'Close dialog'} title="Close" disabled={busy} onClick={close}><X size={19} /></button></header>
    {onSubmit ? <form id={formId} className="modal-form" onSubmit={onSubmit} aria-busy={busy} autoComplete="off">{contents}</form> : <div className="modal-form">{contents}</div>}
  </dialog>;
}
