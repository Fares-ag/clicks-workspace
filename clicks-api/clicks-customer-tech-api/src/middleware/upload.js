const multer = require("multer");

const storage = multer.memoryStorage();

const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
]);

const upload = multer({
  storage,
  limits: {
    fileSize: Number(process.env.UPLOAD_MAX_BYTES || 5 * 1024 * 1024), // 5MB
    files: 10,
  },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME.has(file.mimetype)) {
      return cb(null, true);
    }
    // Flutter web multipart often sends application/octet-stream for PNG bytes.
    if (
      file.mimetype === "application/octet-stream" &&
      (/\.png$/i.test(file.originalname || "") || file.fieldname === "signature")
    ) {
      file.mimetype = "image/png";
      return cb(null, true);
    }
    return cb(new Error(`Unsupported file type: ${file.mimetype}`));
  },
});

module.exports = upload;
