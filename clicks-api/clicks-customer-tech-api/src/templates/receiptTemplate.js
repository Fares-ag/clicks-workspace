const { BRAND, LOGO_DATA_URI } = require("../services/receiptPdf");

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function money(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(2) : "0.00";
}

module.exports = function receiptTemplate({ job = {}, repairs = [], total, receipt } = {}) {
  const items = (Array.isArray(repairs) && repairs.length
    ? repairs
    : receipt?.items || []
  ).map((r) => ({
    description: r.description || "Item",
    quantity: r.quantity || 1,
    price: r.price || 0,
    receipt_image_url: r.receipt_image_url,
  }));
  const grand = total != null ? total : receipt?.total_amount;
  const issued = receipt?.issued_at || job.completed_at || job.dateTime || new Date();
  const photos = items.filter((item) => item.receipt_image_url);

  return `
    <html>
      <head>
        <style>
          body { font-family: Arial, Helvetica, sans-serif; margin: 0; color: #142029; }
          .accent { height: 10px; background: #093345; }
          .head { display: flex; justify-content: space-between; align-items: flex-end;
                  padding: 28px 40px 16px; border-bottom: 2px solid #093345; }
          .head img { width: 210px; height: auto; }
          .title { text-align: right; color: #093345; }
          .title h1 { margin: 0; font-size: 18px; letter-spacing: 0.08em; }
          .title p { margin: 6px 0 0; font-size: 12px; color: #5b6770; }
          .wrap { padding: 24px 40px 48px; }
          .grid { display: flex; gap: 24px; margin-bottom: 20px; }
          .col { flex: 1; }
          .label { color: #5b6770; font-size: 10px; font-weight: 700; letter-spacing: 0.08em; margin-bottom: 8px; }
          .row { display: flex; gap: 10px; font-size: 13px; margin: 4px 0; }
          .k { color: #6b7280; width: 78px; flex-shrink: 0; }
          table.lines { width: 100%; border-collapse: collapse; margin-top: 8px; }
          table.lines th { text-align: left; background: #093345; color: #fff;
                           padding: 9px 8px; font-size: 11px; }
          table.lines th.num, table.lines td.num { text-align: right; }
          table.lines td { border-bottom: 1px solid #e6ecee; padding: 9px 8px; font-size: 13px; }
          .total { background: #093345; color: #fff; font-weight: 700; }
          .photos { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 16px; }
          .photos img { width: 240px; height: 140px; object-fit: contain; background: #f1f4f5; }
          .foot { margin-top: 24px; font-size: 11px; color: #5b6770; }
        </style>
      </head>
      <body>
        <div class="accent"></div>
        <div class="head">
          <img src="${LOGO_DATA_URI}" alt="${escapeHtml(BRAND.company)}" />
          <div class="title">
            <h1>SERVICE RECEIPT</h1>
            <p>${escapeHtml(BRAND.city)}, ${escapeHtml(BRAND.country)}</p>
          </div>
        </div>
        <div class="wrap">
          <div class="grid">
            <div class="col">
              <div class="label">CUSTOMER</div>
              <div class="row"><span class="k">Customer</span><span>${escapeHtml(job.clientName || "")}</span></div>
              <div class="row"><span class="k">Mobile</span><span>${escapeHtml(job.clientMobileNumber || "")}</span></div>
              <div class="row"><span class="k">Vehicle</span><span>${escapeHtml([job.vehicleMake, job.vehicleModel, job.vehicleYear].filter(Boolean).join(" "))}</span></div>
            </div>
            <div class="col">
              <div class="label">SERVICE</div>
              <div class="row"><span class="k">Job</span><span>${escapeHtml(job.job_reference || job._id || "")}</span></div>
              <div class="row"><span class="k">Service</span><span>${escapeHtml(job.jobType || job.issue || "")}</span></div>
              <div class="row"><span class="k">Date</span><span>${escapeHtml(new Date(issued).toISOString())}</span></div>
            </div>
          </div>
          <table class="lines">
            <tr>
              <th>Description</th>
              <th class="num">Qty</th>
              <th class="num">Unit (QAR)</th>
              <th class="num">Amount (QAR)</th>
            </tr>
            ${items.map((r) => `
              <tr>
                <td>${escapeHtml(r.description)}</td>
                <td class="num">${escapeHtml(r.quantity)}</td>
                <td class="num">${money(r.price)}</td>
                <td class="num">${money(r.price * (r.quantity || 1))}</td>
              </tr>
            `).join("")}
            <tr>
              <td colspan="3" class="total">TOTAL</td>
              <td class="num total">QAR ${money(grand)}</td>
            </tr>
          </table>
          ${photos.length ? `<div class="label" style="margin-top:18px">CUSTOMER RECEIPTS</div><div class="photos">${photos.map((p) => `<img src="${escapeHtml(p.receipt_image_url)}" alt="${escapeHtml(p.description)}" />`).join("")}</div>` : ""}
          <p class="foot">Thank you for choosing ${escapeHtml(BRAND.company)}. Issued by ${escapeHtml(BRAND.legal)}, trading as ${escapeHtml(BRAND.legalName)}, ${escapeHtml(BRAND.city)}, ${escapeHtml(BRAND.country)}. Support ${escapeHtml(BRAND.support)}.</p>
        </div>
      </body>
    </html>
  `;
};
