/**
 * Stub outbound side effects — no SMS, FCM, or axios calls leave the test process.
 */
jest.mock("../clicks-customer-tech-api/src/services/smsService", () => ({
  sendSMS: jest.fn(async () => {}),
  sendOtpSms: jest.fn(async () => {}),
  generateOTP: jest.fn(() => "123456"),
  verifyOTP: jest.fn(() => false),
}));

jest.mock("../clicks-customer-tech-api/src/services/fcmService", () => ({
  sendCustomerPush: jest.fn(async () => {}),
  sendJobAssignedPush: jest.fn(async () => {}),
  sendTechnicianPush: jest.fn(async () => {}),
  CUSTOMER_PUSH_EVENTS: {},
}));

jest.mock(
  "axios",
  () => ({
    post: jest.fn(async () => ({ status: 200, data: {} })),
    get: jest.fn(async () => ({ status: 200, data: {} })),
    create: jest.fn(() => ({
      post: jest.fn(async () => ({ status: 200, data: {} })),
      get: jest.fn(async () => ({ status: 200, data: {} })),
    })),
    default: {
      post: jest.fn(async () => ({ status: 200, data: {} })),
      get: jest.fn(async () => ({ status: 200, data: {} })),
    },
  }),
  { virtual: true }
);

jest.mock("../clicks-customer-tech-api/src/services/fileUploadService", () => ({
  uploadFile: jest.fn(async () => "https://test.local/signature.png"),
}));
