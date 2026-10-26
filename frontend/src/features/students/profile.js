export const personalFields = [
  ['givenName', 'Given name', 60], ['middleName', 'Middle name', 60],
  ['lastName', 'Last name', 60], ['suffix', 'Suffix', 15], ['maidenName', 'Maiden name', 120],
  ['dateOfBirth', 'Date of birth', 10, 'date'], ['placeOfBirth', 'Place of birth', 200],
  ['religion', 'Religion', 100], ['civilStatus', 'Civil status', 40],
  ['gender', 'Gender', 60], ['citizenship', 'Citizenship', 100],
];
export const contactFields = [['homeAddress', 'Home address', 500, 'textarea'], ['contactNumber', 'Contact number', 40, 'tel'], ['email', 'Email address', 254, 'email']];
export const levels = [['elementary', 'Elementary'], ['juniorHigh', 'Junior high school'], ['seniorHigh', 'Senior high school'], ['college', 'College']];
export const relatives = [['father', 'Father'], ['mother', 'Mother'], ['guardian', 'Guardian']];
export const familyFields = [['name', 'Name', 120], ['occupation', 'Occupation', 120], ['contactNumber', 'Contact number', 40, 'tel']];
export const schoolFields = [['name', 'School name', 200], ['address', 'School address', 500, 'textarea'], ['email', 'School email', 254, 'email']];
export function emptyProfile() {
  return { ...Object.fromEntries([...personalFields, ...contactFields].map(([key]) => [key, ''])), medication: '', education: Object.fromEntries(levels.map(([key]) => [key, { name: '', address: '', email: '' }])), family: { ...Object.fromEntries(relatives.map(([key]) => [key, { name: '', occupation: '', contactNumber: '' }])), siblings: [] } };
}
export function ageFromBirth(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return '';
  const [year, month, day] = value.split('-').map(Number);
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date());
  const [y, m, d] = today.split('-').map(Number);
  if (value > today) return '';
  return String(y - year - (m < month || (m === month && d < day) ? 1 : 0));
}
