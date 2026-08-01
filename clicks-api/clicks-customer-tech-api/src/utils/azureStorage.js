// clicks-api/clicks-customer-tech-api/src/utils/azureStorage.js

const {
  BlobServiceClient,
  generateBlobSASQueryParameters,
  BlobSASPermissions,
  StorageSharedKeyCredential,
} = require("@azure/storage-blob");

const AZURE_STORAGE_ACCOUNT_NAME = process.env.AZURE_STORAGE_ACCOUNT_NAME;
const AZURE_STORAGE_ACCOUNT_KEY = process.env.AZURE_STORAGE_ACCOUNT_KEY;
const AZURE_BLOB_CONTAINER = process.env.AZURE_BLOB_CONTAINER;

const hasAzureConfig =
  AZURE_STORAGE_ACCOUNT_NAME &&
  AZURE_STORAGE_ACCOUNT_KEY &&
  AZURE_BLOB_CONTAINER;

let containerClient = null;

if (hasAzureConfig) {
  try {
    const connectionString = `DefaultEndpointsProtocol=https;AccountName=${AZURE_STORAGE_ACCOUNT_NAME};AccountKey=${AZURE_STORAGE_ACCOUNT_KEY};EndpointSuffix=core.windows.net`;
    const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
    containerClient = blobServiceClient.getContainerClient(AZURE_BLOB_CONTAINER);
  } catch (err) {
    console.warn("[azureStorage] Invalid Azure config — uploads will use inline fallback:", err.message);
    containerClient = null;
  }
} else {
  console.warn("[azureStorage] Azure Blob Storage is not configured");
}

async function uploadBufferToAzure(buffer, blobName, mimetype) {
  if (!containerClient) {
    throw new Error("Azure Blob Storage is not configured");
  }

  const blockBlobClient = containerClient.getBlockBlobClient(blobName);

  await blockBlobClient.uploadData(buffer, {
    blobHTTPHeaders: {
      blobContentType: mimetype,
    },
  });

  return blockBlobClient.url;
}

function shouldUseSAS(filename) {
  const sensitivePatterns = [
    "technician-license-front",
    "technician-license-back",
    "technician-permit-front",
    "technician-permit-back",
  ];

  return sensitivePatterns.some((pattern) => filename.includes(pattern));
}

function generateSASUrl(blobName) {
  if (!containerClient || !AZURE_STORAGE_ACCOUNT_NAME || !AZURE_STORAGE_ACCOUNT_KEY) {
    throw new Error("Azure Blob Storage is not configured");
  }

  const blockBlobClient = containerClient.getBlockBlobClient(blobName);

  const sasToken = generateBlobSASQueryParameters(
    {
      containerName: AZURE_BLOB_CONTAINER,
      blobName,
      permissions: BlobSASPermissions.parse("r"),
      startsOn: new Date(),
      expiresOn: new Date(Date.now() + 20 * 60 * 1000),
    },
    new StorageSharedKeyCredential(AZURE_STORAGE_ACCOUNT_NAME, AZURE_STORAGE_ACCOUNT_KEY)
  ).toString();

  return `${blockBlobClient.url}?${sasToken}`;
}

module.exports = {
  uploadBufferToAzure,
  shouldUseSAS,
  generateSASUrl,
  hasAzureConfig: Boolean(containerClient),
};
