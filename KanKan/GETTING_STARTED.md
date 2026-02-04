# Getting Started with WeChat Clone

## 📦 What's Been Implemented

### Phase 1 (MVP) - ✅ Completed
- Project structure setup
- Email-based authentication system
- User registration with email verification
- Login/logout functionality
- JWT token-based authentication with refresh tokens
- Database models and repositories (Cosmos DB ready)
- Complete backend API (.NET Core 8)
- Complete frontend (React 18 + TypeScript)

## 🚀 Quick Start

### Prerequisites

Before you begin, ensure you have:
- **Node.js 18+** and npm installed
- **.NET 8 SDK** installed
- **Azure Cosmos DB** account (or use Cosmos DB emulator for local development)
- **SendGrid API key** (optional, for email functionality)

### 1. Backend Setup

#### Install Cosmos DB Emulator (for local development)
Download and install from: https://aka.ms/cosmosdb-emulator

Or use Azure Cosmos DB in the cloud.

#### Configure Backend

1. Navigate to the server directory:
```bash
cd server
```

2. Update `appsettings.json` with your configuration:
```json
{
  "CosmosDb": {
    "Endpoint": "https://localhost:8081",  // Emulator endpoint
    "Key": "C2y6yDjf5/R+ob0N8A7Cgv30VRDJIWEHLM+4QDU5DE2nQ9nDuVTqobD4b8mGGyPMbIZnqyMsEcaGQy67XIw/Jw==",  // Emulator key
    "DatabaseName": "WeChatDB"
  },
  "Jwt": {
    "Secret": "your-super-secret-jwt-key-must-be-at-least-32-characters-long-for-security",
    "Issuer": "WeChat.API",
    "Audience": "WeChat.Client",
    "AccessTokenExpirationMinutes": 15,
    "RefreshTokenExpirationDays": 7
  },
  "Email": {
    "Provider": "SendGrid",
    "ApiKey": "your-sendgrid-api-key-or-leave-empty",
    "FromEmail": "noreply@wechat-clone.com",
    "FromName": "WeChat Clone"
  }
}
```

3. Restore dependencies:
```bash
dotnet restore
```

4. Run the backend:
```bash
dotnet run
```

The API will be available at: `http://localhost:5001`
Swagger documentation: `http://localhost:5001` (root)

### 2. Frontend Setup

1. Navigate to the client directory:
```bash
cd client
```

2. Create `.env` file from the example:
```bash
cp .env.example .env
```

3. Install dependencies:
```bash
npm install
```

4. Start the development server:
```bash
npm run dev
```

The app will be available at: `http://localhost:3000`

### 3. Initialize Cosmos DB

The first time you run the application, you need to create the database and containers.

**Option 1: Use Cosmos DB Data Explorer**
1. Open Cosmos DB emulator at `https://localhost:8081/_explorer/index.html`
2. Create a new database named `WeChatDB`
3. Create the following containers:

| Container Name | Partition Key | Description |
|---------------|---------------|-------------|
| Users | /id | User accounts and profiles |
| Messages | /chatId | Chat messages |
| Chats | /id | Chat metadata |
| Contacts | /userId | User contacts |
| Moments | /userId | Social timeline posts |
| EmailVerifications | /email | Email verification codes (TTL: 600s) |

**Option 2: Use Azure Data Studio or Cosmos DB SDK**

You can also create a script to initialize the database. Create a file `init-db.sh`:

```bash
# This would use Azure CLI or Cosmos DB SDK
# Example commands for reference
az cosmosdb sql database create --account-name YOUR_ACCOUNT --name WeChatDB
az cosmosdb sql container create --account-name YOUR_ACCOUNT --database-name WeChatDB --name Users --partition-key-path "/id"
# ... repeat for other containers
```

## 🧪 Testing the Application

### 1. Register a New User

1. Open `http://localhost:3000` in your browser
2. Click "Create account"
3. Enter your email address
4. Check the console logs for the verification code (since SendGrid might not be configured)
   - Backend will log: `Email not sent (SendGrid not configured): To=your@email.com`
   - Look for the 6-digit code in the HTML content
5. Enter the code, password, and display name
6. You'll be redirected to the chats page

### 2. Login

1. Go to `http://localhost:3000/login`
2. Enter your email and password
3. Click "Sign In"

### 3. Test API with Swagger

1. Open `http://localhost:5001`
2. Explore available endpoints
3. Test authentication flow:
   - POST `/api/auth/register` - Send email
   - POST `/api/auth/verify-email` - Complete registration
   - POST `/api/auth/login` - Login
   - POST `/api/auth/refresh-token` - Refresh token

## 📝 API Endpoints

### Authentication

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/api/auth/register` | Send verification code | No |
| POST | `/api/auth/verify-email` | Complete registration | No |
| POST | `/api/auth/login` | Login | No |
| POST | `/api/auth/logout` | Logout | Yes |
| POST | `/api/auth/refresh-token` | Refresh access token | No (uses cookie) |
| POST | `/api/auth/forgot-password` | Send password reset code | No |
| POST | `/api/auth/reset-password` | Reset password | No |

## 🔧 Troubleshooting

### Backend Issues

**Issue: "CosmosDb:Endpoint not configured"**
- Make sure `appsettings.json` has the correct Cosmos DB configuration
- For local development, install and run Cosmos DB Emulator

**Issue: "JWT Secret not configured"**
- Ensure `Jwt:Secret` in `appsettings.json` is at least 32 characters long

**Issue: Email not being sent**
- This is expected if SendGrid is not configured
- Check console logs for the verification code
- In production, configure SendGrid API key

### Frontend Issues

**Issue: "Network Error" when calling API**
- Ensure backend is running on `http://localhost:5001`
- Check CORS configuration in backend `Program.cs`
- Verify `VITE_API_URL` in `.env` file

**Issue: "Cannot find module '@/...'"**
- Make sure path aliases are configured in `tsconfig.json` and `vite.config.ts`
- Try `npm install` again

### Cosmos DB Issues

**Issue: "Container not found"**
- Create the required containers in Cosmos DB
- Use the exact names from the configuration

**Issue: "Unauthorized" errors with Cosmos DB**
- Verify the account key is correct
- For emulator, use the default key provided

## 📚 Next Steps

### Phase 2: Chat Functionality (Coming Next)
- [ ] SignalR ChatHub implementation
- [ ] Real-time messaging
- [ ] Chat list UI
- [ ] Message window UI
- [ ] Typing indicators
- [ ] Read receipts

### Phase 3: Media Support
- [ ] Image upload and display
- [ ] Azure Blob Storage integration
- [ ] Video messages
- [ ] Voice messages
- [ ] File attachments

### Phase 4: Social Features
- [ ] Contact management
- [ ] Friend requests
- [ ] User profiles
- [ ] Moments/Timeline

## 💡 Development Tips

1. **Use Swagger** for API testing: `http://localhost:5001`
2. **Check Console Logs** for verification codes when email is not configured
3. **Use Redux DevTools** to inspect application state
4. **Enable Hot Reload** - Both frontend (Vite) and backend (dotnet watch) support hot reload

## 🐛 Known Limitations

1. Email functionality requires SendGrid API key
2. No persistent storage for refresh tokens (stored in-memory)
3. Chat functionality not yet implemented (Phase 2)
4. No file upload capability yet (Phase 3)

## 📞 Support

For issues or questions:
1. Check the troubleshooting section
2. Review `Architecture.md` for detailed design
3. Check console logs for errors
4. Verify all prerequisites are installed

---

**Status:** Phase 1 (MVP) Complete ✅
**Next:** Phase 2 - Chat Functionality
**Version:** 1.0.0
