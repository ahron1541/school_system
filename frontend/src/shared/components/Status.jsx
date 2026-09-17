import Photo from './Photo';

const labels = { connected: 'Connected', disconnected: 'Disconnected', not_configured: 'Not configured', invalid_configuration: 'Configuration error', online: 'Online', offline: 'Offline', never_seen: 'Awaiting device', checking: 'Checking', unknown: 'Unavailable' };

export function Status({ state = 'unknown' }) {
  return <span className={`status status-${state}`}><span className="status-dot" />{labels[state] || 'Unavailable'}</span>;
}

export function Avatar({ person, large = false }) {
  return <span className={`avatar ${large ? 'avatar-large' : ''}`}>
    <Photo src={person.photo} fallback={person.initials} />
  </span>;
}
