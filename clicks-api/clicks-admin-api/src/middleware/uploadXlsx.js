const multer = require("multer");

const storage = multer.memoryStorage();

const ALLOWED_MIME = new Set([
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "application/octet-stream",
]);

const uploadXlsx = multer({
  storage,
  limits: {
    fileSize: Number(process.env.IMPORT_XLSX_MAX_BYTES || 20 * 1024 * 1024), // 20MB
    files: 1,
  },
  fileFilter: (_req, file, cb) => {
    const name = String(file.originalname || "").toLowerCase();
    const isXlsx = name.endsWith(".xlsx") || name.endsWith(".xls");
    if (isXlsx && (ALLOWED_MIME.has(file.mimetype) || file.mimetype === "application/octet-stream")) {
      return cb(null, true);
    }
    if (ALLOWED_MIME.has(file.mimetype) && isXlsx) {
      return cb(null, true);
    }
    return cb(new Error("Only Excel files (.xlsx) are allowed"));
  },
});

module.exports = uploadXlsx;
