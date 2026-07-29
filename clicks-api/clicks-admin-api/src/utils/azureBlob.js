const { BlobServiceClient } = require("@azure/storage-blob");

const AZURE_STORAGE_CONNECTION_STRING = process.env.AZURE_STORAGE_CONNECTION_STRING;
const AZURE_BLOB_CONTAINER = process.env.AZURE_BLOB_CONTAINER;

if (!AZURE_STORAGE_CONNECTION_STRING || !AZURE_BLOB_CONTAINER) {
  console.warn("Azure Blob Storage environment variables are not set.");
}

const blobServiceClient = AZURE_STORAGE_CONNECTION_STRING 
  ? BlobServiceClient.fromConnectionString(AZURE_STORAGE_CONNECTION_STRING)
  : null;

async function uploadBufferToBlob(buffer, blobName, mimetype) {
  if (!blobServiceClient) {
    throw new Error("Azure Blob Storage is not configured");
  }
  
  const containerClient = blobServiceClient.getContainerClient(AZURE_BLOB_CONTAINER);
  const blockBlobClient = containerClient.getBlockBlobClient(blobName);
  await blockBlobClient.uploadData(buffer, {
    blobHTTPHeaders: { blobContentType: mimetype }
  });
  return blockBlobClient.url;
}

module.exports = {
  uploadBufferToBlob
};
