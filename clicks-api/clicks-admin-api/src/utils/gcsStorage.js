// clicks-api/clicks-admin-api/src/utils/azureStorage.js

const { BlobServiceClient } = require('@azure/storage-blob');

const AZURE_STORAGE_ACCOUNT_NAME = process.env.AZURE_STORAGE_ACCOUNT_NAME;
const AZURE_STORAGE_ACCOUNT_KEY = process.env.AZURE_STORAGE_ACCOUNT_KEY;
const AZURE_BLOB_CONTAINER = process.env.AZURE_BLOB_CONTAINER;

const blobServiceClient = BlobServiceClient.fromConnectionString(
  `DefaultEndpointsProtocol=https;AccountName=${AZURE_STORAGE_ACCOUNT_NAME};AccountKey=${AZURE_STORAGE_ACCOUNT_KEY};EndpointSuffix=core.windows.net`
);

const containerClient = blobServiceClient.getContainerClient(AZURE_BLOB_CONTAINER);

async function uploadBufferToAzure(buffer, blobName, mimetype) {
  const blockBlobClient = containerClient.getBlockBlobClient(blobName);
  
  await blockBlobClient.uploadData(buffer, {
    blobHTTPHeaders: {
      blobContentType: mimetype
    }
  });
  
  return `https://${AZURE_STORAGE_ACCOUNT_NAME}.blob.core.windows.net/${AZURE_BLOB_CONTAINER}/${blobName}`;
}

module.exports = {
  uploadBufferToAzure,
};
