# KanKan - Real-time Messaging Application

A full-stack real-time messaging application built with React, .NET Core, SignalR, and MongoDB.

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
- **.NET 9** - Framework
- **ASP.NET Core Web API** - RESTful API
- **SignalR** - WebSocket server
- **MongoDB** - NoSQL database
- **Local/Cloud Storage** - Media storage
- **JWT Authentication** - Security
- **BCrypt.NET** - Password hashing

### Infrastructure
- **MongoDB** - Database
- **Docker** - Containerization

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
│   └── KanKan.API.csproj
│
├── Architecture.md         # System architecture documentation
└── README.md              # This file
```

## 🛠️ Setup Instructions

### Prerequisites
- Node.js 18+ and npm
- .NET 9 SDK
- Docker Desktop (for MongoDB)
- MongoDB (via Docker)

### Environment Variables

#### Client (.env)
```env
VITE_API_URL=http://localhost:5000/api
VITE_SIGNALR_URL=http://localhost:5000/hub/chat
```

#### Server (appsettings.json)
```json
{
  "StorageMode": "MongoDB",
  "MongoDB": {
    "ConnectionString": "mongodb://admin:password123@localhost:27017",
    "DatabaseName": "KanKanDB"
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
   "FromName": "KanKan"
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
# API will run on http://localhost:5000
```

**Terminal 2 - Start Frontend:**
```bash
cd client
npm install 
npm run dev
npm start
# UI will run on http://localhost:3000
```

#### Docker (Linux, user-defined network)

```bash
docker pull mcr.microsoft.com/dotnet/sdk:9.0
docker pull node:20-bookworm-slim
docker network create kankan-net

docker run -d --name kanapi --network kankan-net \
   -v /mnt/data/Jiuzhang/KanKan/server:/server -w /server \
   mcr.microsoft.com/dotnet/sdk:9.0 \
   bash -lc "dotnet restore && dotnet run --urls http://0.0.0.0:5000"

docker run -it --rm --name kanui --network kankan-net -p 80:3000 \
   -v /mnt/data/Jiuzhang/KanKan/client:/app -w /app \
   node:20-bookworm-slim \
   bash -lc "npm install && npm run dev -- --host 0.0.0.0 --port 3000"
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

### MongoDB Collections

1. **Users** - User accounts and profiles
2. **UserEmailLookup** - Email -> user id lookup
3. **Messages** - Chat messages
4. **Chats** - Chat metadata (direct and group)
5. **ChatUsers** - Per-user chat summaries
6. **Contacts** - User contacts and friend requests
7. **Moments** - Social timeline posts
8. **EmailVerifications** - Email verification codes (TTL: 10 min)
9. **Notifications** - Notifications (TTL enabled)

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

### MongoDB Setup

1. **Pull MongoDB image:**
   ```bash
   docker pull mongo:latest
   ```

2. **Start MongoDB with Docker:**
   ```bash
   docker run -d \
     --name mongodb \
     -p 27017:27017 \
     -e MONGO_INITDB_ROOT_USERNAME=admin \
     -e MONGO_INITDB_ROOT_PASSWORD=password123 \
     -v mongodb_data:/data/db \
     mongo:latest
   ```

3. **Create database, user, and collections (optional manual bootstrap):**
   ```bash
   docker exec -it mongodb mongosh -u admin -p password123 --authenticationDatabase admin
   ```

   ```javascript
   use KanKanDB

   db.createUser({
     user: "kankan",
     pwd: "kankan123",
     roles: [ { role: "readWrite", db: "KanKanDB" } ]
   })

   db.createCollection("Users")
   db.createCollection("UserEmailLookup")
   db.createCollection("Chats")
   db.createCollection("ChatUsers")
   db.createCollection("Messages")
   db.createCollection("Contacts")
   db.createCollection("Moments")
   db.createCollection("EmailVerifications")
   db.createCollection("Notifications")

   show collections
   exit
   ```

4. **Configure Application:**
   Update `appsettings.json` with MongoDB connection string:
   ```json
   {
     "StorageMode": "MongoDB",
     "MongoDB": {
       "ConnectionString": "mongodb://admin:password123@localhost:27017",
          "DatabaseName": "KanKanDB",
          "Initialization": {
             "Enabled": true,
             "SeedTestData": true
          }
     }
   }
   ```

5. **Deploy Application:**
   ```bash
   # Build backend
   cd server
   dotnet publish -c Release

   # Build frontend
   cd ../client
   npm run build

   # Deploy to your hosting platform of choice
   # (Docker, Kubernetes, VPS, etc.)
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
- `GET /api/chat` - Get user's chat list
- `GET /api/chat/{chatId}` - Get chat details
- `POST /api/chat` - Create new chat
- `PUT /api/chat/{chatId}` - Update chat (group name/avatar)
- `DELETE /api/chat/{chatId}` - Delete/leave chat

- `POST /api/chat/{chatId}/hide` - Hide chat for current user
- `POST /api/chat/{chatId}/unhide` - Unhide chat for current user
- `POST /api/chat/{chatId}/clear` - Clear chat history for current user

- `GET /api/chat/{chatId}/messages` - Get messages
- `POST /api/chat/{chatId}/messages` - Send message
- `DELETE /api/chat/{chatId}/messages/{messageId}` - Delete message

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
- **System Monitoring** - Resource monitoring
- **SignalR Dashboard** - Connection monitoring
- **MongoDB Metrics** - Database performance

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

- Inspired by modern messaging platforms
- Built with modern web technologies
- MongoDB database infrastructure

## 📞 Support

For support, email support@example.com or open an issue in the repository.

---

**Version:** 1.0.0
**Last Updated:** 2024-02-03
