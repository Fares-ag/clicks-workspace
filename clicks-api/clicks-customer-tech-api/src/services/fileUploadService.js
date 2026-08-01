const { uploadBufferToAzure, hasAzureConfig } = require("../utils/azureStorage");

function resolveImageMime(file, filename) {
  let mimetype = file.mimetype || "application/octet-stream";
  const name = filename || file.originalname || "";

  if (mimetype === "application/octet-stream") {
    if (/\.png$/i.test(name) || /signature/i.test(name)) {
      mimetype = "image/png";
    } else if (/\.jpe?g$/i.test(name)) {
      mimetype = "image/jpeg";
    } else if (/\.webp$/i.test(name)) {
      mimetype = "image/webp";
    }
  }

  return mimetype;
}

function inlineImageDataUrl(buffer, mimetype) {
  const b64 = buffer.toString("base64");
  return `data:${mimetype};base64,${b64}`;
}

async function uploadFile(file, filename) {
  const mimetype = resolveImageMime(file, filename);
  const buffer = file.buffer;

  if (!buffer || !Buffer.isBuffer(buffer)) {
    throw new Error("Upload buffer missing");
  }

  if (hasAzureConfig) {
    try {
      return await uploadBufferToAzure(buffer, filename, mimetype);
    } catch (err) {
      console.error("[fileUploadService] Azure upload failed:", err.message);
      if (mimetype.startsWith("image/")) {
        return inlineImageDataUrl(buffer, mimetype);
      }
      throw err;
    }
  }

  if (mimetype.startsWith("image/")) {
    return inlineImageDataUrl(buffer, mimetype);
  }

  throw new Error("Azure Blob Storage is not configured");
}

async function deleteFile(_filename) {
  return false;
}

function getFileUrl(filename) {
  const accountName = process.env.AZURE_STORAGE_ACCOUNT_NAME;
  const container = process.env.AZURE_BLOB_CONTAINER;
  return `https://${accountName}.blob.core.windows.net/${container}/${filename}`;
}

module.exports = {
  uploadFile,
  deleteFile,
  getFileUrl,
};
