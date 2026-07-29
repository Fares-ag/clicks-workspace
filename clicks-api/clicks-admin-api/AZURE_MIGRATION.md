# Clicks Admin API - Azure Migration Guide

## Overview
This guide documents the migration from GCP to Azure for the Clicks Admin API, including Azure Blob Storage for file uploads and Azure Communication Services for email notifications.

## Azure Services Configuration

### 1. Azure Blob Storage

**Purpose**: Store images and files (profile pictures, documents, vehicle documents, etc.)

**Configuration**:
- Storage Account Name: `clicksfiles`
- Container Name: `clicks-files`
- Connection String: Set in `.env` as `AZURE_STORAGE_CONNECTION_STRING`

**Environment Variables**:
```bash
AZURE_STORAGE_CONNECTION_STRING=DefaultEndpointsProtocol=https;AccountName=clicksfiles;AccountKey=<your-key>;EndpointSuffix=core.windows.net
AZURE_STORAGE_ACCOUNT_NAME=clicksfiles
AZURE_BLOB_CONTAINER=clicks-files
```

**Features**:
- Profile picture uploads for admins
- Document uploads for technicians (ID, license, insurance, etc.)
- Vehicle document uploads (registration, insurance, etc.)

**Implementation Files**:
- `/src/utils/azureStorage.js` - Main blob storage utility
- `/src/utils/azureBlob.js` - Alternative blob storage utility
- Used in: `adminController.js`, `technicianController.js`, `vehicleController.js`

### 2. Azure Communication Services (Email)

**Purpose**: Send transactional emails (password reset OTPs, confirmations)

**Configuration**:
- Resource: `clicks-staging-email`
- Region: UAE (United Arab Emirates)
- Sender Domain: `515ab6d4-9322-48cc-a240-e4b1ddb4ceb3.azurecomm.net`
- Sender Address: `DoNotReply@515ab6d4-9322-48cc-a240-e4b1ddb4ceb3.azurecomm.net`

**Environment Variables**:
```bash
AZURE_COMMUNICATION_CONNECTION_STRING=endpoint=https://clicks-staging-email.uae.communication.azure.com/;accesskey=<your-key>
AZURE_EMAIL_FROM=DoNotReply@515ab6d4-9322-48cc-a240-e4b1ddb4ceb3.azurecomm.net
```

**Features**:
- Password reset OTP emails (6-digit code)
- Password reset confirmation emails
- HTML email templates with Clicks branding

**Implementation Files**:
- `/src/utils/emailService.js` - Email service utility
- Used in: `authController.js`

## Password Reset Flow

### 1. Forgot Password Endpoint

**Endpoint**: `POST /api/auth/forgot-password`

**Request Body**:
```json
{
  "email": "admin@example.com"
}
```

**Response**:
```json
{
  "message": "Password reset code sent to email",
  "email": "admin@example.com"
}
```

**Process**:
1. Validates email exists in database
2. Generates 6-digit OTP code
3. Stores code in `PasswordReset` collection with 15-minute expiration
4. Sends formatted email with OTP code via Azure Communication Services
5. Returns success response

### 2. Reset Password Endpoint

**Endpoint**: `POST /api/auth/reset-password`

**Request Body**:
```json
{
  "email": "admin@example.com",
  "token": "123456",
  "newPassword": "newSecurePassword123"
}
```

**Response**:
```json
{
  "message": "Password reset successful. You can now login with your new password."
}
```

**Process**:
1. Validates email, token, and new password
2. Checks if token exists and hasn't been used
3. Verifies token hasn't expired (15-minute window)
4. Updates admin password with hashed version
5. Marks token as used
6. Sends confirmation email
7. Returns success response

## Database Models

### PasswordReset Model

**Location**: `/clicks-shared/models/PasswordReset.js`

**Schema**:
```javascript
{
  email: String (required),
  token: String (required),
  expiresAt: Date (required),
  used: Boolean (default: false),
  createdAt: Date (default: Date.now)
}
```

**Features**:
- Automatic expiration via MongoDB TTL index
- Prevents token reuse with `used` flag
- 15-minute expiration window

## Setup Instructions

### 1. Install Dependencies

```bash
cd clicks-admin-api
npm install
```

**Key Dependencies**:
- `@azure/storage-blob` - Azure Blob Storage SDK
- `@azure/communication-email` - Azure Communication Services Email SDK
- `crypto` - Built-in Node.js module for token generation

### 2. Configure Environment Variables

Copy `.env.example` to `.env` and fill in your Azure credentials:

```bash
cp .env.example .env
```

### 3. Update Shared Models

The `PasswordReset` model has been added to the shared models package. If you need to rebuild:

```bash
cd ../clicks-shared
npm install
```

### 4. Start the Server

```bash
cd ../clicks-admin-api
npm run dev
```

## File Upload Endpoints

### Admin Profile Picture
- **Endpoint**: `POST /api/admins/:id/upload-profile`
- **Field**: `file` (single file)
- **Accepts**: Images (jpg, png, etc.)

### Technician Documents
- **Endpoint**: `POST /api/technicians/:id/upload-documents`
- **Fields**: Multiple files (license, insurance, ID, etc.)

### Vehicle Documents
- **Endpoint**: `POST /api/vehicles/:id/upload-documents`
- **Fields**: Multiple files (registration, insurance, etc.)

All uploads now use Azure Blob Storage and return publicly accessible URLs.

## Testing

### Test Password Reset Flow

1. **Request Reset Code**:
```bash
curl -X POST http://localhost:5000/api/auth/forgot-password \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com"}'
```

2. **Check email for 6-digit code**

3. **Reset Password**:
```bash
curl -X POST http://localhost:5000/api/auth/reset-password \
  -H "Content-Type: application/json" \
  -d '{
    "email":"admin@example.com",
    "token":"123456",
    "newPassword":"newPassword123"
  }'
```

### Test File Upload

```bash
curl -X POST http://localhost:5000/api/admins/ADMIN_ID/upload-profile \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -F "file=@/path/to/image.jpg"
```

## Security Considerations

1. **OTP Codes**: 6-digit codes expire after 15 minutes
2. **One-Time Use**: Tokens cannot be reused once consumed
3. **Password Hashing**: Passwords are hashed using bcrypt
4. **JWT Authentication**: File uploads require valid JWT token
5. **Email Validation**: Only registered admin emails can request password resets

## Troubleshooting

### Email Not Sending
- Verify `AZURE_COMMUNICATION_CONNECTION_STRING` is correct
- Check Azure Communication Services resource status
- Ensure sender domain is verified in Azure portal
- Check console logs for detailed error messages

### File Upload Fails
- Verify `AZURE_STORAGE_CONNECTION_STRING` is correct
- Ensure blob container `clicks-files` exists
- Check blob container has proper access permissions
- Verify storage account has sufficient quota

### Token Expired
- OTP codes expire after 15 minutes
- Request a new code via forgot-password endpoint
- Old codes are automatically cleaned up by MongoDB TTL index

## Migration Checklist

- [x] Install Azure SDK packages
- [x] Configure Azure Blob Storage connection
- [x] Configure Azure Communication Services connection
- [x] Update blob storage utilities
- [x] Create email service utility
- [x] Create PasswordReset model
- [x] Implement forgot password endpoint
- [x] Implement reset password endpoint
- [x] Create HTML email templates
- [x] Update environment variables
- [x] Test password reset flow
- [x] Test file uploads to Azure Blob Storage

## Next Steps

1. **Frontend Integration**: Update the admin interface to use the new password reset endpoints
2. **Production Environment**: Configure production Azure resources and update environment variables
3. **Monitoring**: Set up Azure Monitor for blob storage and email service
4. **Error Handling**: Implement proper error logging and monitoring
5. **Rate Limiting**: Add rate limiting to password reset endpoints to prevent abuse
