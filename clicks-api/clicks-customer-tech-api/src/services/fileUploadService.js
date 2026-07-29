const { uploadBufferToAzure } = require("../utils/azureStorage");

// Upload file to Azure Blob Storage
const uploadFile = async (file, filename) => {
  const mimetype = file.mimetype || "application/octet-stream";
  return await uploadBufferToAzure(file.buffer, filename, mimetype);
};

// Delete file (not implemented for Azure, stub)
const deleteFile = async (filename) => {
  // Optionally implement Azure file deletion if needed
  return false;
};

// Get file URL (returns the Azure Blob URL)
const getFileUrl = (filename) => {
  const accountName = process.env.AZURE_STORAGE_ACCOUNT_NAME;
  const container = process.env.AZURE_BLOB_CONTAINER;
  return `https://${accountName}.blob.core.windows.net/${container}/${filename}`;
};

module.exports = {
  uploadFile,
  deleteFile,
  getFileUrl
};
