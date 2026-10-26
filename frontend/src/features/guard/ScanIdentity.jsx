import { ScanLine, UserRound } from 'lucide-react';
import Photo from '../../shared/components/Photo';

export default function ScanIdentity({ scan, publicDisplay = false, connection = 'never_seen' }) {
  if (!scan) {
    const online = connection === 'online';
    return <div className="scan-idle" role="status"><ScanLine size={48} /><h2>{online ? 'Ready for the next scan' : connection === 'degraded' ? 'Reader needs attention' : connection === 'offline' ? 'Reader disconnected' : 'Waiting for reader connection'}</h2><p>{online ? 'No recent card scan' : publicDisplay ? 'Please see the guard.' : connection === 'degraded' ? 'Check the scanner display for the reported fault.' : 'No recent reader heartbeat received.'}</p></div>;
  }
  if(publicDisplay) return <section className="scan-identity public-identity" aria-live="polite" aria-atomic="true">
    <div className="scan-photo"><Photo key={scan.id} src={scan.person?.photo} alt={scan.person?'Photo of '+scan.person.name:''} fallback={<UserRound size={64}/>}/></div>
    <div className="scan-details"><span className={'reader-light reader-light-'+scan.indicator} role="img" aria-label={scan.indicator==='green'?'Scan accepted':scan.indicator==='red'?'Guard review required':'Guard attention required'}/><h2>{scan.person?.name||'Please see the guard'}</h2>{scan.person&&<><p className="reader-program">{scan.person.course}</p><p className="reader-enrollment">{scan.person.active?'Enrolled':'Enrollment inactive'}</p></>}</div>
  </section>;
  return <section className={'scan-identity scan-' + scan.status} aria-live="polite" aria-atomic="true">
    <div className="scan-photo"><Photo key={scan.id} src={scan.person?.photo} alt={scan.person ? 'Photo of ' + scan.person.name : ''} fallback={<><UserRound size={64} /><span>{scan.person ? 'No photo available' : 'Unknown card'}</span></>} /></div>
    <div className="scan-details"><span className="scan-result">{scan.direction === 'IN' ? 'Entry recorded' : scan.direction === 'OUT' ? 'Exit recorded' : scan.status === 'blocked' ? 'See the guard' : scan.status === 'ignored' ? 'Already scanned' : 'Card not registered'}</span><h2>{scan.person?.name || 'Please see the guard'}</h2>
      {!publicDisplay && scan.person && <p>{scan.person.studentNo} / {scan.person.course} / {scan.person.year} {scan.person.section}</p>}
      <p>{scan.message}</p><time dateTime={scan.receivedAt}>{new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(scan.receivedAt))}</time>
      {!publicDisplay && scan.notices?.includes('REPORT_TO_OFFICE') && <strong className="scan-alert">Active violation on record. Review privately.</strong>}
    </div>
  </section>;
}
