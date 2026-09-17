import { ScanLine, UserRound } from 'lucide-react';
import Photo from '../../shared/components/Photo';

export default function ScanIdentity({ scan, publicDisplay = false }) {
  if (!scan) return <div className="scan-idle" role="status"><ScanLine size={48} /><h2>Ready for the next scan</h2><p>No recent card scan</p></div>;
  return <section className={'scan-identity scan-' + scan.status} aria-live="polite" aria-atomic="true">
    <div className="scan-photo"><Photo key={scan.id} src={scan.person?.photo} alt={scan.person ? 'Photo of ' + scan.person.name : ''} fallback={<><UserRound size={64} /><span>{scan.person ? 'No photo available' : 'Unknown card'}</span></>} /></div>
    <div className="scan-details"><span className="scan-result">{scan.direction === 'IN' ? 'Entry recorded' : scan.direction === 'OUT' ? 'Exit recorded' : scan.status === 'blocked' ? 'See the guard' : scan.status === 'ignored' ? 'Already scanned' : 'Card not registered'}</span><h2>{scan.person?.name || 'Please see the guard'}</h2>
      {!publicDisplay && scan.person && <p>{scan.person.studentNo} / {scan.person.course} / {scan.person.year} {scan.person.section}</p>}
      {!scan.direction && <p>{scan.message}</p>}<time dateTime={scan.receivedAt}>{new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(scan.receivedAt))}</time>
      {!publicDisplay && scan.status === 'alert' && <strong className="scan-alert">Active violation on record. Review privately.</strong>}
    </div>
  </section>;
}
