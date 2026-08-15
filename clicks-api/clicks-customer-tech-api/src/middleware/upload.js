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
    const name = file.originalname || "";
    // Flutter / Android photo pickers often send application/octet-stream
    // (or image/jpg) instead of a real image MIME.
    if (
      file.mimetype === "application/octet-stream" ||
      file.mimetype === "image/jpg" ||
      file.mimetype === "image/heic" ||
      file.mimetype === "image/heif"
    ) {
      if (/\.png$/i.test(name) || file.fieldname === "signature") {
        file.mimetype = "image/png";
        return cb(null, true);
      }
      if (/\.webp$/i.test(name)) {
        file.mimetype = "image/webp";
        return cb(null, true);
      }
      if (/\.gif$/i.test(name)) {
        file.mimetype = "image/gif";
        return cb(null, true);
      }
      if (/\.(jpe?g|heic|heif)$/i.test(name) || file.fieldname === "homeHero") {
        file.mimetype = "image/jpeg";
        return cb(null, true);
      }
    }
    return cb(new Error(`Unsupported file type: ${file.mimetype}`));
  },
});

module.exports = upload;
