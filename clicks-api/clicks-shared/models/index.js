const Admin = require("./Admin");
const Customer = require("./Customer");
const CustomerVehicle = require("./CustomerVehicle");
const SOSRequest = require("./SOSRequest");
const Technician = require("./Technician");
const Job = require("./Job");
const Vehicle = require("./Vehicle");
const VehicleMake = require("./VehicleMake");
const VehicleModel = require("./VehicleModel");
const VehicleType = require("./VehicleType");
const Source = require("./Source");
const VehicleInsurance = require("./VehicleInsurance");

module.exports = {
  Admin: require("./Admin"),
  Customer: require("./Customer"),
  CustomerVehicle: require("./CustomerVehicle"),
  Job: require("./Job"),
  SOSRequest: require("./SOSRequest"),
  ServiceRequest: require("./ServiceRequest"),
  Lead: require("./Lead"),
  Source: require("./Source"),
  Technician: require("./Technician"),
  Vehicle: require("./Vehicle"),
  VehicleInsurance: require("./VehicleInsurance"),
  VehicleMake: require("./VehicleMake"),
  VehicleModel: require("./VehicleModel"),
  VehicleType: require("./VehicleType"),
  RepairProcedure: require("./RepairProcedure"),
  SupportTicket: require("./SupportTicket"),
  Receipt: require("./Receipt"),
  OTPVerification: require("./OTPVerification"),
  TechnicianEarnings: require("./TechnicianEarnings"),
  TechnicianEarningEntry: require("./TechnicianEarningEntry"),
  PasswordReset: require("./PasswordReset"),
  ContactUs: require("./ContactUs"),
  FAQ: require("./FAQ"),
  PrivacyPolicy: require("./PrivacyPolicy"),
  TermsAndConditions: require("./TermsAndConditions"),
  Business: require("./Business"),
  BusinessUser: require("./BusinessUser"),
  FinanceUser: require("./FinanceUser"),
  FinanceAuditLog: require("./FinanceAuditLog"),
  Vendor: require("./Vendor"),
  VendorPurchase: require("./VendorPurchase"),
  Subscription: require("./Subscription"),
  Partner: require("./Partner"),
  PartnerEarning: require("./PartnerEarning"),
  PartnerWithdrawal: require("./PartnerWithdrawal"),
  AccountDeletionRequest: require("./AccountDeletionRequest"),
  OutboxEvent: require("./OutboxEvent"),
  AdminAuditLog: require("./AdminAuditLog"),
  TechnicianActivityLog: require("./TechnicianActivityLog"),
  PlatformStats: require("./PlatformStats"),
  Notification: require("./Notification"),
};
