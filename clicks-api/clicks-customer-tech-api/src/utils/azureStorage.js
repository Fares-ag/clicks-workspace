// clicks-api/clicks-customer-tech-api/src/utils/azureStorage.js

const { BlobServiceClient, generateBlobSASQueryParameters, BlobSASPermissions } = require('@azure/storage-blob');

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
  const blockBlobClient = containerClient.getBlockBlobClient(blobName);
  
  // Generate SAS token with 20 minute expiry
  const sasToken = generateBlobSASQueryParameters({
    containerName: AZURE_BLOB_CONTAINER,
    blobName: blobName,
    permissions: BlobSASPermissions.parse("r"), // Read only
    startsOn: new Date(),
    expiresOn: new Date(new Date().valueOf() + 20 * 60 * 1000), // 20 minutes
  }, {
    accountName: AZURE_STORAGE_ACCOUNT_NAME,
    accountKey: AZURE_STORAGE_ACCOUNT_KEY
  }).toString();
  
  return `${blockBlobClient.url}?${sasToken}`;
}

module.exports = {
  uploadBufferToAzure,
  shouldUseSAS,
  generateSASUrl
};
