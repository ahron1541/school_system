import { personalFields, contactFields, schoolFields, levels, familyFields, relatives } from './profile.js';

export const registrationSteps = ['Personal', 'Academic', 'Contact', 'Additional', 'Review'];
export function fieldStep(path) {
  if (path.startsWith('profile.education.')) return 1;
  if (path.startsWith('profile.family.') || path === 'profile.medication' || path === 'uid') return 3;
  if (contactFields.some(([key]) => path === 'profile.' + key)) return 2;
  return path.startsWith('profile.') ? 0 : 1;
}
export function registrationFields(values) {
  return [
    ...personalFields.map(item => ['profile.' + item[0], ...item.slice(1)]),
    ['studentNo', 'Student ID', 50], ['course', 'Course / program', 120], ['year', 'Year level', 30], ['section', 'Section', 40],
    ...contactFields.map(item => ['profile.' + item[0], ...item.slice(1)]),
    ...levels.flatMap(([level, label]) => schoolFields.map(([key, name, ...rest]) => [`profile.education.${level}.${key}`, `${label}: ${name}`, ...rest])),
    ...relatives.flatMap(([relative, label]) => familyFields.map(([key, name, ...rest]) => [`profile.family.${relative}.${key}`, `${label}: ${name}`, ...rest])),
    ...values.profile.family.siblings.flatMap((_, index) => familyFields.map(([key, name, ...rest]) => [`profile.family.siblings.${index}.${key}`, `Sibling ${index + 1}: ${name}`, ...rest])),
    ['profile.medication', 'Medication', 2000], ['uid', 'RFID UID', 20],
  ];
}
export const fieldValue = (values, path) => path.split('.').reduce((value, key) => value?.[key], values) || '';
export function validateRegistration(values, step) {
  const errors = {};
  const required = ['profile.givenName', 'profile.lastName', 'studentNo', 'course', 'year'];
  for (const [path, label, max, type] of registrationFields(values)) {
    if (step !== undefined && fieldStep(path) !== step) continue;
    const value = fieldValue(values, path).trim();
    if (required.includes(path) && !value) errors[path] = label + ' is required.';
    else if (value.length > max) errors[path] = `${label} must be ${max} characters or fewer.`;
    else if (path.startsWith('profile.') && /[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(value)) errors[path] = 'Remove unsupported control characters.';
    else if (value && type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) errors[path] = 'Enter a valid email address.';
    else if (value && path === 'uid' && !/^(?:[0-9a-f]{8}|[0-9a-f]{14}|[0-9a-f]{20})$/i.test(value)) errors[path] = 'Enter an 8, 14 or 20 character hexadecimal UID.';
    else if (value && type === 'date') {
      const date = new Date(value + 'T00:00:00Z');
      const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date());
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value || value > today) errors[path] = 'Enter a valid date of birth that is not in the future.';
    }
  }
  const name = ['givenName', 'middleName', 'lastName', 'suffix'].map(key => values.profile[key].trim()).filter(Boolean).join(' ');
  if ((step === undefined || step === 0) && name.length > 120) errors['profile.givenName'] = 'The combined student name must be 120 characters or fewer.';
  return errors;
}
