// clicks-api/clicks-admin-api/src/utils/azureStorage.js

const { BlobServiceClient, generateBlobSASQueryParameters, BlobSASPermissions, StorageSharedKeyCredential } = require('@azure/storage-blob');

const AZURE_STORAGE_CONNECTION_STRING = process.env.AZURE_STORAGE_CONNECTION_STRING;
const AZURE_BLOB_CONTAINER = process.env.AZURE_BLOB_CONTAINER;

// Extract account name and key from connection string
let AZURE_STORAGE_ACCOUNT_NAME, AZURE_STORAGE_ACCOUNT_KEY;
if (AZURE_STORAGE_CONNECTION_STRING) {
  const parts = AZURE_STORAGE_CONNECTION_STRING.split(';');
  AZURE_STORAGE_ACCOUNT_NAME = parts.find(p => p.startsWith('AccountName='))?.split('=')[1];
  AZURE_STORAGE_ACCOUNT_KEY = parts.find(p => p.startsWith('AccountKey='))?.split('=')[1];
}

if (!AZURE_STORAGE_CONNECTION_STRING || !AZURE_BLOB_CONTAINER) {
  console.warn('Azure Blob Storage configuration is missing');
}

const blobServiceClient = AZURE_STORAGE_CONNECTION_STRING 
  ? BlobServiceClient.fromConnectionString(AZURE_STORAGE_CONNECTION_STRING)
  : null;

const containerClient = blobServiceClient ? blobServiceClient.getContainerClient(AZURE_BLOB_CONTAINER) : null;

async function uploadBufferToAzure(buffer, blobName, mimetype) {
  if (!containerClient) {
    throw new Error('Azure Blob Storage is not configured');
  }

  const blockBlobClient = containerClient.getBlockBlobClient(blobName);
  
  await blockBlobClient.uploadData(buffer, {
    blobHTTPHeaders: {
      blobContentType: mimetype
    }
  });
  
  return blockBlobClient.url;
}

/**
 * Check if a file should use SAS token based on its path
 * @param {string} filename - The filename/path
 * @returns {boolean}
 */
function shouldUseSAS(filename) {
  const sensitivePatterns = [
    'technician-license-front',
    'technician-license-back',
    'technician-permit-front',
    'technician-permit-back'
  ];
  
  return sensitivePatterns.some(pattern => filename.includes(pattern));
}

/**
 * Generate a SAS token URL for a blob with 20 minute expiry
 * @param {string} blobName - The blob name/path
 * @returns {string} - URL with SAS token
 */
function generateSASUrl(blobName) {
  if (!containerClient || !AZURE_STORAGE_ACCOUNT_NAME || !AZURE_STORAGE_ACCOUNT_KEY) {
    throw new Error('Azure Blob Storage is not configured');
  }

  const blockBlobClient = containerClient.getBlockBlobClient(blobName);
  
  // Generate SAS token with 20 minute expiry
  const sasToken = generateBlobSASQueryParameters({
    containerName: AZURE_BLOB_CONTAINER,
    blobName: blobName,
    permissions: BlobSASPermissions.parse("r"), // Read only
    startsOn: new Date(),
    expiresOn: new Date(new Date().valueOf() + 20 * 60 * 1000), // 20 minutes
  }, new StorageSharedKeyCredential(AZURE_STORAGE_ACCOUNT_NAME, AZURE_STORAGE_ACCOUNT_KEY)).toString();
  
  return `${blockBlobClient.url}?${sasToken}`;
}

module.exports = {
  uploadBufferToAzure,
  shouldUseSAS,
  generateSASUrl
};
