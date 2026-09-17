const sharp = require('sharp');
const { randomUUID } = require('node:crypto');
const { ApiError } = require('../../shared/middleware/error-handler');

function createStudentPhotoService(db) {
  async function read(id) {
    const { rows } = await db.query('SELECT image FROM student_photos WHERE student_id=$1', [id]);
    if (!rows[0]) throw new ApiError(404, 'PHOTO_NOT_FOUND', 'No student photo on file.');
    return rows[0].image;
  }
  async function save(id, input, actorId) {
    let image;
    try {
      if (!Buffer.isBuffer(input) || !input.length) throw new Error('Missing image');
      const processor = sharp(input, { limitInputPixels: 20000000, failOn: 'warning' });
      const meta = await processor.metadata();
      if (!['jpeg','png','webp'].includes(meta.format) || (meta.pages || 1) !== 1) throw new Error('Unsupported image');
      image = await processor.rotate().resize({ width: 600, height: 800, fit: 'inside', withoutEnlargement: true }).flatten({ background: '#ffffff' }).jpeg({ quality: 85 }).toBuffer();
      if (image.length > 524288) throw new Error('Image too large');
    } catch { throw new ApiError(422, 'INVALID_PHOTO', 'Choose a valid JPG, PNG or WebP photo, at most 2 MB and 20 megapixels.'); }
    await db.transaction(async (client) => {
      if (!(await client.query('SELECT id FROM students WHERE id=$1 FOR UPDATE', [id])).rowCount) throw new ApiError(404, 'STUDENT_NOT_FOUND', 'Student not found.');
      await client.query('INSERT INTO student_photos(student_id,image) VALUES($1,$2) ON CONFLICT(student_id) DO UPDATE SET image=$2,updated_at=now()', [id, image]);
      await client.query('INSERT INTO audit_logs(id,actor_id,action,target_id) VALUES($1,$2,$3,$4)', [randomUUID(), actorId, 'STUDENT_PHOTO_UPDATED', id]);
      await client.query('INSERT INTO sync_outbox(id,entity_type,entity_id,payload) VALUES($1,$2,$3,$4)', [randomUUID(), 'student_photos', id, { student_id: id, contentType: 'image/jpeg', imageBase64: image.toString('base64') }]);
    });
    return { photo: '/api/students/' + id + '/photo' };
  }
  return { read, save };
}
module.exports = { createStudentPhotoService };
