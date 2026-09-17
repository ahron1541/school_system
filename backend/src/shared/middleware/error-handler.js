class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);
  let failure = error;
  if (error.type === 'entity.parse.failed') failure = new ApiError(400, 'INVALID_JSON', 'Body must contain valid JSON.');
  if (error.type === 'entity.too.large') failure = new ApiError(413, 'BODY_TOO_LARGE', 'Request body exceeds the allowed size.');
  if (error.status === 415) failure = new ApiError(415, 'UNSUPPORTED_ENCODING', 'Use uncompressed UTF-8 JSON.');
  if (!(failure instanceof ApiError)) {
    console.error('[ERROR] Unexpected request failure.');
    failure = new ApiError(500, 'INTERNAL_ERROR', 'An unexpected server error occurred.');
  }
  res.status(failure.status).json({ success: false, message: failure.message, error: { code: failure.code } });
}

module.exports = { ApiError, errorHandler };
