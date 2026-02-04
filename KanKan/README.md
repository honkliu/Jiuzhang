# WeChat Clone - Real-time Messaging Application

A full-stack real-time messaging application built with React, .NET Core, SignalR, and Azure Cosmos DB.

## 🚀 Features

### Phase 1 (MVP - Current)
- ✅ Email-based authentication (registration, login, password reset)
- ✅ 1-on-1 real-time messaging
- ✅ Message delivery status and read receipts
- ✅ Typing indicators
- ✅ User online/offline status

### Planned Features
- Group chats with admin management
- Rich media support (images, videos, voice messages, files)
- Message reactions and replies
- Contact management with friend requests
- User profiles and settings
- Social timeline (Moments)
- Voice/video calls (WebRTC)
- Push notifications

## 📋 Tech Stack

### Frontend
- **React 18** - UI library
- **TypeScript** - Type safety
- **Redux Toolkit** - State management
- **Material-UI** - UI components
- **SignalR Client** - Real-time communication
- **Axios** - HTTP client
- **React Router v6** - Routing

### Backend
- **.NET 8** - Framework
- **ASP.NET Core Web API** - RESTful API
- **SignalR** - WebSocket server
- **Azure Cosmos DB** - NoSQL database
- **Azure Blob Storage** - Media storage
- **JWT Authentication** - Security
- **BCrypt.NET** - Password hashing

### Infrastructure
- **Azure App Service** - Hosting
- **Azure Cosmos DB** - Database
- **Azure SignalR Service** - WebSocket scaling
- **Azure Blob Storage** - File storage
- **Azure Redis Cache** - Caching

## 📁 Project Structure

```
KanKan/
├── client/                 # React frontend
│   ├── public/
│   ├── src/
│   │   ├── components/     # React components
│   │   │   ├── Auth/       # Authentication components
│   │   │   ├── Chat/       # Chat components
│   │   │   ├── Contacts/   # Contact management
│   │   │   ├── Moments/    # Social timeline
│   │   │   ├── Profile/    # User profile
│   │   │   └── Shared/     # Shared components
│   │   ├── services/       # API services
│   │   ├── store/          # Redux store
│   │   ├── hooks/          # Custom hooks
│   │   ├── types/          # TypeScript types
│   │   └── utils/          # Utility functions
│   └── package.json
│
├── server/                 # .NET Core backend
│   ├── Controllers/        # API controllers
│   ├── Hubs/              # SignalR hubs
│   ├── Services/          # Business logic
│   ├── Repositories/      # Data access
│   ├── Models/            # Data models
│   ├── Middleware/        # Custom middleware
│   └── WeChat.API.csproj
│
├── Architecture.md         # System architecture documentation
└── README.md              # This file
```

## 🛠️ Setup Instructions

### Prerequisites
- Node.js 18+ and npm
- .NET 8 SDK
- Azure account (for deployment)
- Azure Cosmos DB instance
- Azure Storage account

### Environment Variables

#### Client (.env)
```env
VITE_API_URL=http://localhost:5001/api
VITE_SIGNALR_URL=http://localhost:5001/hub/chat
```

#### Server (appsettings.json)
```json
{
  "CosmosDb": {
    "Endpoint": "your-cosmos-db-endpoint",
    "Key": "your-cosmos-db-key",
    "DatabaseName": "WeChatDB"
  },
  "Jwt": {
    "Secret": "your-jwt-secret-key-at-least-32-characters",
    "AccessTokenExpirationMinutes": 15,
    "RefreshTokenExpirationDays": 7
  },
  "Email": {
    "Provider": "SendGrid",
    "ApiKey": "your-sendgrid-api-key",
    "FromEmail": "noreply@example.com",
    "FromName": "WeChat Clone"
  }
}
```

### Installation

#### 1. Clone the repository
```bash
git clone <repository-url>
cd KanKan
```

#### 2. Install frontend dependencies
```bash
cd client
npm install
```

#### 3. Install backend dependencies
```bash
cd ../server
dotnet restore
```

### Running the Application

#### Development Mode

**Terminal 1 - Start Backend:**
```bash
cd server
dotnet run
# API will run on http://localhost:5001
```

**Terminal 2 - Start Frontend:**
```bash
cd client
npm start
# UI will run on http://localhost:3000
```

#### Production Build

**Frontend:**
```bash
cd client
npm run build
```

**Backend:**
```bash
cd server
dotnet publish -c Release
```

## 🗄️ Database Schema

### Cosmos DB Containers

1. **Users** - User accounts and profiles
2. **Messages** - Chat messages (partitioned by chatId)
3. **Chats** - Chat metadata (direct and group)
4. **Contacts** - User contacts and friend requests
5. **Moments** - Social timeline posts
6. **EmailVerifications** - Email verification codes (TTL: 10 min)

See [Architecture.md](Architecture.md) for detailed data models.

## 🔐 Authentication Flow

1. **Registration:**
   - User enters email
   - Server sends 6-digit verification code
   - User enters code + password + display name
   - Account created, JWT tokens issued

2. **Login:**
   - User enters email + password
   - Server validates credentials
   - JWT access token (15 min) + refresh token (7 days) issued
   - Refresh token stored in HTTP-only cookie

3. **Token Refresh:**
   - Access token expires after 15 minutes
   - Client automatically refreshes using refresh token
   - New tokens issued (token rotation)

## 🚀 Deployment

### Azure Deployment

1. **Create Azure Resources:**
   ```bash
   # Create Resource Group
   az group create --name wechat-rg --location eastus

   # Create App Service Plan
   az appservice plan create --name wechat-plan --resource-group wechat-rg --sku B1

   # Create Web App
   az webapp create --name wechat-api --resource-group wechat-rg --plan wechat-plan

   # Create Cosmos DB
   az cosmosdb create --name wechat-db --resource-group wechat-rg

   # Create Storage Account
   az storage account create --name wechatstorage --resource-group wechat-rg
   ```

2. **Configure App Settings:**
   ```bash
   az webapp config appsettings set --name wechat-api --resource-group wechat-rg --settings \
     CosmosDb__Endpoint=<endpoint> \
     CosmosDb__Key=<key> \
     Jwt__Secret=<secret>
   ```

3. **Deploy Application:**
   ```bash
   # Deploy backend
   cd server
   dotnet publish -c Release
   az webapp deploy --resource-group wechat-rg --name wechat-api --src-path ./bin/Release/net8.0/publish

   # Deploy frontend (to Azure Static Web Apps or Blob Storage + CDN)
   cd ../client
   npm run build
   az storage blob upload-batch --account-name wechatstorage --source ./build --destination '$web'
   ```

## 📊 API Endpoints

### Authentication
- `POST /api/auth/register` - Send verification code
- `POST /api/auth/verify-email` - Verify code and create account
- `POST /api/auth/login` - Login
- `POST /api/auth/logout` - Logout
- `POST /api/auth/refresh-token` - Refresh access token
- `POST /api/auth/forgot-password` - Send password reset code
- `POST /api/auth/reset-password` - Reset password

### Chats
- `GET /api/chats` - Get user's chat list
- `GET /api/chats/{chatId}` - Get chat details
- `POST /api/chats` - Create new chat
- `GET /api/chats/{chatId}/messages` - Get messages
- `POST /api/chats/{chatId}/messages` - Send message
- `DELETE /api/chats/{chatId}/messages/{messageId}` - Delete message

### Contacts
- `GET /api/contacts` - Get contact list
- `POST /api/contacts/request` - Send friend request
- `POST /api/contacts/accept/{requestId}` - Accept friend request
- `DELETE /api/contacts/{userId}` - Remove contact

### Media
- `POST /api/media/upload` - Upload file
- `GET /api/media/{fileId}` - Get file

## 🧪 Testing

```bash
# Run backend tests
cd server
dotnet test

# Run frontend tests
cd client
npm test

# Run E2E tests
npm run test:e2e
```

## 📈 Monitoring

- **Application Insights** - Performance monitoring
- **Azure Monitor** - Resource monitoring
- **SignalR Dashboard** - Connection monitoring
- **Cosmos DB Metrics** - Database performance

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 👥 Authors

- Architecture Team

## 🙏 Acknowledgments

- Inspired by WeChat messaging platform
- Built with modern web technologies
- Azure cloud infrastructure

## 📞 Support

For support, email support@example.com or open an issue in the repository.

---

**Version:** 1.0.0
**Last Updated:** 2024-02-03
