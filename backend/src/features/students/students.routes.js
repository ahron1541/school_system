const express = require('express');
const { ApiError } = require('../../shared/middleware/error-handler');
const { validateStudent } = require('./students.validation');
const { createStudentService } = require('./students.service');
const { createStudentPhotoService } = require('./student-photo.service');

function studentsRoutes(db, auth) {
  const router = express.Router();
  const service = createStudentService(db);
  const photos = createStudentPhotoService(db);
  router.use(auth.requireAuth);
  router.param('id', (req, res, next, id) => {
    if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id)) throw new ApiError(422, 'INVALID_ID', 'Invalid student ID.');
    next();
  });
  router.get('/:id/photo', async (req, res) => res.type('image/jpeg').send(await photos.read(req.params.id)));
  router.put('/:id/photo', auth.allow('ADMIN','REGISTRAR'), express.raw({ type: ['image/jpeg','image/png','image/webp'], limit: '2mb', inflate: false }), async (req, res) => {
    res.json({ success: true, message: 'Student photo saved.', data: await photos.save(req.params.id, req.body, req.auth.user.id) });
  });
  router.get('/', async (req,res) => res.json({ success:true, message:'Students retrieved.', data:await service.list() }));
  async function save(req,res) {
    const input = validateStudent(req.body);
    if (req.params.id && !/^[a-f0-9-]{36}$/.test(req.params.id)) throw new ApiError(422,'INVALID_ID','Invalid student ID.');
    const data = await service.save(input,req.auth.user.id,req.params.id);
    res.status(req.params.id ? 200 : 201).json({ success:true, message:'Student saved.', data });
  }
  router.post('/',auth.allow('ADMIN','REGISTRAR'),save);
  router.put('/:id',auth.allow('ADMIN','REGISTRAR'),save);
  return router;
}
module.exports = { studentsRoutes };
