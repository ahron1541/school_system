const { ApiError } = require('../../shared/middleware/error-handler');

const fields = {
  givenName: 60, lastName: 60, middleName: 60, suffix: 15, maidenName: 120,
  dateOfBirth: 10, placeOfBirth: 200, religion: 100, civilStatus: 40,
  gender: 60, citizenship: 100, homeAddress: 500, contactNumber: 40,
  email: 254, medication: 2000,
};
const schoolFields = { name: 200, address: 500, email: 254 };
const familyFields = { name: 120, occupation: 120, contactNumber: 40 };
function invalid(field, message) {
  const error = new ApiError(422, 'INVALID_PROFILE', message);
  error.fields = { [field]: message };
  throw error;
}
function object(value, allowed, path) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !allowed.includes(key))) invalid(path, 'Unsupported profile fields.');
}
function strings(value, limits, prefix = 'profile') {
  object(value, Object.keys(limits), prefix);
  return Object.fromEntries(Object.entries(limits).map(([key, max]) => {
    const text = value[key] ?? '';
    if (typeof text !== 'string' || text.trim().length > max || /[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(text)) invalid(`${prefix}.${key}`, `Use text up to ${max} characters.`);
    const result = text.trim();
    if (key === 'email' && result && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result)) invalid(`${prefix}.${key}`, 'Enter a valid email address.');
    return [key, result];
  }));
}
function validateProfile(input) {
  object(input, [...Object.keys(fields), 'education', 'family'], 'profile');
  const scalar = Object.fromEntries(Object.keys(fields).filter(key => key in input).map(key => [key, input[key]]));
  const profile = strings(scalar, fields);
  if (!profile.givenName) invalid('profile.givenName', 'Given name is required.');
  if (!profile.lastName) invalid('profile.lastName', 'Last name is required.');
  if (profile.dateOfBirth) {
    const date = new Date(profile.dateOfBirth + 'T00:00:00Z');
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date());
    if (!/^\d{4}-\d{2}-\d{2}$/.test(profile.dateOfBirth) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== profile.dateOfBirth || profile.dateOfBirth > today) invalid('profile.dateOfBirth', 'Enter a valid birth date that is not in the future.');
  }
  const education = input.education ?? {};
  object(education, ['elementary', 'juniorHigh', 'seniorHigh', 'college'], 'profile.education');
  profile.education = Object.fromEntries(['elementary', 'juniorHigh', 'seniorHigh', 'college'].map(level => [level, strings(education[level] ?? {}, schoolFields, `profile.education.${level}`)]));
  const family = input.family ?? {};
  object(family, ['father', 'mother', 'guardian', 'siblings'], 'profile.family');
  profile.family = Object.fromEntries(['father', 'mother', 'guardian'].map(key => [key, strings(family[key] ?? {}, familyFields, `profile.family.${key}`)]));
  if (family.siblings !== undefined && (!Array.isArray(family.siblings) || family.siblings.length > 20)) invalid('profile.family.siblings', 'Add no more than 20 siblings.');
  profile.family.siblings = (family.siblings ?? []).map((sibling, index) => strings(sibling, familyFields, `profile.family.siblings.${index}`));
  return profile;
}
function profileName(profile) {
  return [profile.givenName, profile.middleName, profile.lastName, profile.suffix].filter(Boolean).join(' ');
}
module.exports = { validateProfile, profileName };
