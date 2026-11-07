const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildReceiptPdf,
  buildLineItems,
  customerIdentity,
  receiptNumber,
  receiptFilename,
  formatQatarWhen,
  moneyWords,
  BRAND,
} = require("./receiptPdf");

test("builds a Sanadcom-branded PDF receipt", async () => {
  const pdf = await buildReceiptPdf({
    receipt: {
      _id: "507f1f77bcf86cd799439011",
      total_amount: 150,
      payment_status: "paid",
      issued_at: "2026-11-07T07:00:00.000Z",
    },
    job: {
      job_reference: "QA-100",
      clientName: "Test Customer",
      clientMobileNumber: "+97450000000",
      jobType: "Flat tire",
      price: 150,
      vehicleMake: "Toyota",
      vehicleModel: "Camry",
      location: "West Bay, Doha",
      payment_method: "cash",
    },
    repairs: [],
  });

  assert.ok(Buffer.isBuffer(pdf));
  assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
  assert.ok(pdf.includes(Buffer.from("DCTDecode")));
  const text = pdf.toString("latin1");
  assert.match(text, /Sanadcom/);
  assert.match(text, /SERVICE RECEIPT/);
  assert.match(text, /Sanad RSA/);
  assert.match(text, /QA-100/);
  assert.match(text, /150\.00/);
  assert.match(text, /7091 9191/);
  assert.match(text, /PAID/);
  assert.match(text, /West Bay, Doha/);
  assert.match(text, /TOTAL/);
  assert.match(text, /One hundred and fifty Qatari riyals only/);
  assert.match(text, /Customer/);
  assert.match(text, /Test Customer/);
});

test("prints customer account details when the job snapshot is sparse", () => {
  const customer = customerIdentity({
    customer_id: {
      first_name: "Sara",
      last_name: "Hassan",
      phone_number: "+97455550000",
      email: "sara@example.com",
      client_id: "OC-104",
    },
    licensePlate: "123456",
    vehicleMake: "Toyota",
    vehicleModel: "Camry",
  });
  assert.equal(customer.name, "Sara Hassan");
  assert.equal(customer.mobile, "+97455550000");
  assert.equal(customer.clientId, "OC-104");
  assert.equal(customer.plate, "123456");
});

test("embeds uploaded customer receipt photos", async () => {
  const jpeg = require("fs").readFileSync(
    require("path").join(__dirname, "..", "assets", "sanad-logo.jpg")
  );
  const pdf = await buildReceiptPdf({
    receipt: { total_amount: 230, payment_status: "paid" },
    job: { price: 150, jobType: "Flat tire", clientName: "Omar Al-Thani" },
    repairs: [{ description: "Valve stem", quantity: 1, price: 80 }],
    photos: [{ width: 1400, height: 375, bytes: jpeg, caption: "Valve stem", filter: "DCTDecode" }],
  });
  const text = pdf.toString("latin1");
  assert.match(text, /CUSTOMER RECEIPTS/);
  assert.match(text, /Valve stem/);
  assert.match(text, /Omar Al-Thani/);
});

test("itemizes call-out plus repairs so the table matches total", () => {
  const { items, total } = buildLineItems({
    receipt: { total_amount: 230 },
    job: { price: 150, jobType: "Battery jump" },
    repairs: [{ description: "Battery clamp", quantity: 1, price: 80 }],
  });
  assert.equal(total, 230);
  assert.equal(items.length, 2);
  assert.equal(items[0].description, "Battery jump");
  assert.equal(items[0].price, 150);
  assert.equal(items[1].description, "Battery clamp");
  assert.equal(items[1].price, 80);
});

test("prints a membership included adjustment", () => {
  const { items, total } = buildLineItems({
    receipt: {},
    job: {
      price: 150,
      jobType: "Flat tire",
      membership: { cover: "included", included: true, planName: "Gold" },
    },
    repairs: [{ description: "Valve stem", quantity: 1, price: 40 }],
  });
  assert.equal(total, 40);
  assert.ok(items.some((row) => /Gold - included/.test(row.description) && row.price === -150));
});

test("formats Qatar local time and receipt numbers", () => {
  assert.equal(formatQatarWhen("2026-11-07T07:00:00.000Z"), "7 Nov 2026, 10:00 AM AST");
  assert.equal(
    receiptNumber(
      { _id: "abc1234d", issued_at: "2026-11-07T07:00:00.000Z" },
      { _id: "job" }
    ),
    "REC-20261107-234D"
  );
  assert.equal(receiptFilename({ job_reference: "CLK-26-0147" }), "sanadcom-receipt-CLK-26-0147.pdf");
  assert.equal(BRAND.company, "Sanadcom");
  assert.equal(moneyWords(150), "One hundred and fifty Qatari riyals only");
  assert.equal(moneyWords(1150.25), "One thousand one hundred and fifty Qatari riyals and twenty-five dirhams only");
});

test("labels SkipCash payments and unpaid snapshots", async () => {
  const paid = (await buildReceiptPdf({
    receipt: { payment_status: "paid", total_amount: 150 },
    job: {
      price: 150,
      payment_method: "card",
      skipcash: { transaction_id: "SC-99" },
    },
    repairs: [],
  })).toString("latin1");
  assert.match(paid, /SkipCash/);
  assert.match(paid, /SC-99/);

  const unpaid = (await buildReceiptPdf({
    receipt: { payment_status: "unpaid", total_amount: 1150 },
    job: { price: 1150, jobType: "Towing", payment_status: "unpaid" },
    repairs: [],
  })).toString("latin1");
  assert.match(unpaid, /UNPAID/);
});
