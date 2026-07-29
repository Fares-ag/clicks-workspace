const { shouldUseSAS, generateSASUrl } = require('./azureStorage');

/**
 * Extract blob name from Azure URL
 * @param {string} url - The Azure blob URL
 * @returns {string|null} - The blob name or null if invalid
 */
function extractBlobName(url) {
  if (!url || typeof url !== 'string') return null;
  
  try {
    const urlObj = new URL(url);
    const pathParts = urlObj.pathname.split('/');
    // Remove empty first element and container name
    pathParts.shift();
    pathParts.shift();
    return pathParts.join('/');
  } catch (error) {
    return null;
  }
}

/**
 * Add SAS token to URL if it's a sensitive document
 * @param {string} url - The blob URL
 * @returns {string} - URL with SAS token if needed, otherwise original URL
 */
function addSASTokenIfNeeded(url) {
  if (!url) return url;
  
  const blobName = extractBlobName(url);
  if (!blobName) return url;
  
  if (shouldUseSAS(blobName)) {
    return generateSASUrl(blobName);
  }
  
  return url;
}

/**
 * Transform technician object to add SAS tokens to sensitive document URLs
 * @param {Object} technician - The technician object
 * @returns {Object} - Technician with SAS URLs
 */
function addSASToTechnician(technician) {
  if (!technician) return technician;
  
  const tech = technician.toObject ? technician.toObject() : { ...technician };
  
  tech.drivingLicenseFront = addSASTokenIfNeeded(tech.drivingLicenseFront);
  tech.drivingLicenseBack = addSASTokenIfNeeded(tech.drivingLicenseBack);
  tech.workPermitFront = addSASTokenIfNeeded(tech.workPermitFront);
  tech.workPermitBack = addSASTokenIfNeeded(tech.workPermitBack);
  tech.homeHeroUrl = addSASTokenIfNeeded(tech.homeHeroUrl) || tech.homeHeroUrl;
  tech.profilePicture = addSASTokenIfNeeded(tech.profilePicture) || tech.profilePicture;
  
  return tech;
}

/**
 * Transform array of technicians to add SAS tokens
 * @param {Array} technicians - Array of technician objects
 * @returns {Array} - Technicians with SAS URLs
 */
function addSASToTechnicians(technicians) {
  if (!Array.isArray(technicians)) return technicians;
  return technicians.map(tech => addSASToTechnician(tech));
}

module.exports = {
  addSASTokenIfNeeded,
  addSASToTechnician,
  addSASToTechnicians,
  extractBlobName
};
