module.exports = function receiptTemplate({ job, repairs, total }) {
  return `
    <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; margin: 40px; }
          h1 { color: #2d3e50; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; }
          th, td { border: 1px solid #ccc; padding: 8px; text-align: left; }
          th { background: #f5f5f5; }
          .total { font-weight: bold; }
        </style>
      </head>
      <body>
        <h1>Receipt</h1>
        <p><strong>Job ID:</strong> ${job._id}</p>
        <p><strong>Customer:</strong> ${job.clientName}</p>
        <p><strong>Technician:</strong> ${job.assignedTechnician}</p>
        <p><strong>Date:</strong> ${new Date(job.dateTime).toLocaleString()}</p>
        <table>
          <tr>
            <th>Description</th>
            <th>Quantity</th>
            <th>Price</th>
            <th>Total</th>
          </tr>
          ${repairs.map(r => `
            <tr>
              <td>${r.description}</td>
              <td>${r.quantity}</td>
              <td>${r.price}</td>
              <td>${r.price * (r.quantity || 1)}</td>
            </tr>
          `).join("")}
          <tr>
            <td colspan="3" class="total">Grand Total</td>
            <td class="total">${total}</td>
          </tr>
        </table>
      </body>
    </html>
  `;
};
