const puppeteer = require("puppeteer");
const path = require("path");
const fs = require("fs");
const receiptTemplate = require("../templates/receiptTemplate");

const generatePDF = async ({ job, repairs, total }, filename) => {
  const htmlContent = receiptTemplate({ job, repairs, total });
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  await page.setContent(htmlContent, { waitUntil: "networkidle0" });
  const pdfBuffer = await page.pdf({ format: "A4" });
  await browser.close();

  const pdfPath = path.join(__dirname, "../../uploads", filename);
  fs.writeFileSync(pdfPath, pdfBuffer);
  return `/uploads/${filename}`;
};

module.exports = {
  generatePDF
};
