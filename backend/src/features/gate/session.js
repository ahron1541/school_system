function schoolSession(now, config = {}) {
  const date = new Intl.DateTimeFormat('en-CA', { timeZone:'Asia/Manila' }).format(now);
  const start = new Date(`${date}T${config.schoolSessionStart || '07:00'}:00+08:00`);
  const end = new Date(`${date}T${config.schoolSessionEnd || '20:00'}:00+08:00`);
  return { date, start, end, open: now >= start && now < end };
}
module.exports = { schoolSession };
