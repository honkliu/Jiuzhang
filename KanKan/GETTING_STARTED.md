# Getting Started with KanKan

## 📦 What's Been Implemented

### Phase 1 (MVP) - ✅ Completed
- Project structure setup
- Email-based authentication system
- User registration with email verification
- Login/logout functionality
- JWT token-based authentication with refresh tokens
- Database models and repositories (MongoDB ready)
- Complete backend API (.NET 9)
- Complete frontend (React 18 + TypeScript)

## 🚀 Quick Start

### Prerequisites

Before you begin, ensure you have:
- **Node.js 18+** and npm installed
- **.NET 9 SDK** installed
- **Docker Desktop** installed (optional, only needed for MongoDB persistent mode)
- **SendGrid API key** (optional, for email functionality)

### 1. Backend Setup

#### Choose Your Storage Mode

The application supports two storage modes:

1. **InMemory Mode** (Default - Quick Start)
   - No database setup required
   - Perfect for quick testing and development
   - Data is lost when application restarts
   - Test users (Alice, Bob, Carol) are automatically created

2. **MongoDB Mode** (Persistent Storage)
   - Requires MongoDB Docker container
   - Data persists across application restarts
   - Suitable for production or long-term development

#### Option A: InMemory Mode (Quick Start - No MongoDB Needed)

If you just want to quickly test the application without setting up MongoDB:

1. Navigate to the server directory:
```bash
cd server
```

2. The default `appsettings.json` is already configured for InMemory mode:
```json
{
  "StorageMode": "InMemory"
}
```

Optional: add an admin whitelist to `appsettings.json` so those accounts are created with admin privileges (scoped to their email domain):
```json
{
  "AdminEmails": [
    "admin@kankan.local"
  ]
}
```

Optional: add domain isolation rules to block direct visibility between domains (group chat invites bypass isolation):
```json
{
  "DomainIsolation": {
    "@yue.com": [
      "@kankan",
      "@admin.com"
    ]
  }
}
```

Optional: add domain visibility rules to allow two domains to see each other (bidirectional):
```json
{
  "DomainVisibility": {
    "@ruoli.com": [
      "@shaol.com",
      "@four.com"
    ]
  }
}
```

3. Run the backend:
```bash
dotnet restore
dotnet run
```

That's it! The application will start with in-memory storage and test users (Alice, Bob, Carol) will be automatically created.

#### Option B: MongoDB Mode (Persistent Storage)

For persistent data storage, follow these steps:

##### Install MongoDB using Docker

1. Pull the official MongoDB Docker image:
```bash
docker pull mongo:latest
```

2. Run MongoDB in a Docker container:
```bash
docker run -d \
  --name mongodb \
  -p 27017:27017 \
  -e MONGO_INITDB_ROOT_USERNAME=<mongo-root-user> \
  -e MONGO_INITDB_ROOT_PASSWORD=<mongo-root-password> \
  -v mongodb_data:/data/db \
  mongo:latest
```

**What this command does:**
- `-d` - Runs the container in detached mode (background)
- `--name mongodb` - Names the container "mongodb"
- `-p 27017:27017` - Maps port 27017 (MongoDB default) from container to host
- `-e MONGO_INITDB_ROOT_USERNAME=<mongo-root-user>` - Sets root username
- `-e MONGO_INITDB_ROOT_PASSWORD=<mongo-root-password>` - Sets root password
- `-v mongodb_data:/data/db` - Creates a volume for data persistence
- `mongo:latest` - Uses the latest MongoDB image

3. Verify MongoDB is running:
```bash
docker ps
```

You should see the mongodb container running.

4. Connect to MongoDB shell to create database and user (optional - the app will auto-create):
```bash
docker exec -it mongodb mongosh -u <mongo-root-user> -p <mongo-root-password> --authenticationDatabase admin
```

5. In the MongoDB shell, create database and user:
```javascript
use KanKanDB

db.createUser({
  user: "kankan",
  pwd: "<db-user-password>",
  roles: [
    { role: "readWrite", db: "KanKanDB" }
  ]
})

// Verify
show dbs
exit
```

6. (Optional) Create collections manually if you want explicit bootstrap commands:
```javascript
use KanKanDB

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
```

**Useful Docker Commands:**
```bash
# Stop MongoDB
docker stop mongodb

# Start MongoDB
docker start mongodb

# View MongoDB logs
docker logs mongodb

# Remove MongoDB container (data persists in volume)
docker rm mongodb

# Remove MongoDB data volume (WARNING: deletes all data)
docker volume rm mongodb_data
```

##### Configure Backend for MongoDB

1. Navigate to the server directory:
```bash
cd server
```

2. Update `appsettings.json` to enable MongoDB mode:
```json
{
  "StorageMode": "MongoDB",
  "MongoDB": {
    "ConnectionString": "mongodb://<mongo-user>:<mongo-password>@<mongo-host>:<mongo-port>",
    "DatabaseName": "KanKanDB",
    "Initialization": {
      "Enabled": true,
      "SeedTestData": true
    }
  }
}
```

3. Run the backend:
```bash
dotnet restore
dotnet run
```

The API will be available at: `<api-base-url>`

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

The app will be available at: `<frontend-url>`

### 3. Initialize MongoDB

The application automatically initializes MongoDB when `MongoDB:Initialization:Enabled` is set to true. On startup, it will:

1. Create the database if it doesn't exist
2. Create all required collections
3. Create indexes for optimal query performance
4. Seed test users (Alice, Bob, Carol) when `SeedTestData` is enabled

You can verify the setup by connecting to MongoDB:

```bash
docker exec -it mongodb mongosh -u <mongo-root-user> -p <mongo-root-password> --authenticationDatabase admin
```

Then in the MongoDB shell:

```javascript
use KanKanDB

// Show all collections
show collections

// You should see:
// - Users
// - UserEmailLookup
// - Chats
// - ChatUsers
// - Messages
// - Contacts
// - Moments
// - EmailVerifications
// - Notifications

// Check indexes on Users collection
db.Users.getIndexes()

// Exit
exit
```

**MongoDB Management Options:**

1. **MongoDB Compass** (Recommended GUI):
   - Download from: https://www.mongodb.com/products/compass
  - Connect using: `mongodb://<mongo-user>:<mongo-password>@<mongo-host>:<mongo-port>`

2. **Command Line** (mongosh):
   ```bash
   # Connect
  docker exec -it mongodb mongosh -u <mongo-root-user> -p <mongo-root-password> --authenticationDatabase admin

   # List databases
   show dbs

   # Switch to KanKanDB
   use KanKanDB

   # List collections
   show collections

   # Query users
   db.Users.find().pretty()

   # Count documents
   db.Users.countDocuments()
   ```

3. **VS Code Extension**:
   - Install "MongoDB for VS Code" extension
  - Connect to `mongodb://<mongo-user>:<mongo-password>@<mongo-host>:<mongo-port>`

## 🔄 Storage Mode Configuration

The application supports flexible storage configuration via the `StorageMode` setting in `appsettings.json`:

### InMemory Mode

```json
{
  "StorageMode": "InMemory"
}
```

**Features:**
- ✅ No database required
- ✅ Fast startup
- ✅ Perfect for development and testing
- ✅ Test users (Alice, Bob, Carol) auto-created
- ⚠️ Data lost on restart

**Use when:**
- Quick prototyping
- Running automated tests
- Learning the application
- No MongoDB available

### MongoDB Mode

```json
{
  "StorageMode": "MongoDB",
  "MongoDB": {
    "ConnectionString": "mongodb://<mongo-user>:<mongo-password>@<mongo-host>:<mongo-port>",
    "DatabaseName": "KanKanDB",
    "Initialization": {
      "Enabled": true
    }
  }
}
```

**Features:**
- ✅ Data persists across restarts
- ✅ Production-ready
- ✅ Scalable storage
- ✅ Auto-creates collections and indexes
- 🔧 Requires MongoDB setup

**Use when:**
- Production deployment
- Long-term development
- Data persistence needed
- Team collaboration

### Switching Between Modes

Simply change the `StorageMode` value and restart the application:

```bash
# Switch to InMemory mode
"StorageMode": "InMemory"

# Switch to MongoDB mode (requires MongoDB running)
"StorageMode": "MongoDB"
```

No code changes needed - just configuration!

## 🧪 Testing the Application

### 1. Register a New User

1. Open `<frontend-url>` in your browser
2. Click "Create account"
3. Enter your email address
4. Check the console logs for the verification code (since SendGrid might not be configured)
   - Backend will log: `Email not sent (SendGrid not configured): To=your@email.com`
   - Look for the 6-digit code in the HTML content
5. Enter the code, password, and display name
6. You'll be redirected to the chats page

### 2. Login

1. Go to `<frontend-url>/login`
2. Enter your email and password
3. Click "Sign In"

### 3. Test API with Swagger

1. Open `<api-base-url>`
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

**Issue: "MongoDB ConnectionString not configured"**
- Make sure `appsettings.json` has the correct MongoDB configuration
- For local development with Docker, use: `mongodb://<mongo-user>:<mongo-password>@<mongo-host>:<mongo-port>`
- Verify MongoDB container is running: `docker ps`

**Issue: "Cannot connect to MongoDB"**
- Check if MongoDB container is running: `docker ps`
- Restart MongoDB if needed: `docker restart mongodb`
- Verify port 27017 is not blocked by firewall

**Issue: "Authentication failed"**
- Ensure username/password in connection string matches Docker environment variables
- Default credentials: username=`<mongo-root-user>`, password=`<mongo-root-password>`

**Issue: Email not being sent**
- This is expected if SendGrid is not configured
- Check console logs for the verification code
- In production, configure SendGrid API key

### Frontend Issues

**Issue: "Network Error" when calling API**
- Ensure backend is running on `<api-base-url>`
- Check CORS configuration in backend `Program.cs`
- Verify `VITE_API_URL` in `.env` file

**Issue: "Cannot find module '@/...'"**
- Make sure path aliases are configured in `tsconfig.json` and `vite.config.ts`
- Try `npm install` again

### MongoDB Issues

**Issue: "Collection not found"**
- The application auto-creates collections on startup
- Verify `MongoDB:Initialization:Enabled` is true in `appsettings.json`
- Restart the backend application

**Issue: "Connection timeout"**
- Check if MongoDB Docker container is running: `docker ps`
- Check MongoDB logs: `docker logs mongodb`
- Ensure port 27017 is accessible

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

1. **Use Swagger** for API testing: `<swagger-url>`
2. **Check Console Logs** for verification codes when email is not configured
3. **Use Redux DevTools** to inspect application state
4. **Enable Hot Reload** - Both frontend (Vite) and backend (dotnet watch) support hot reload
5. **MongoDB Compass** - Use MongoDB Compass GUI for easy database management
6. **Docker Commands** - Use `docker logs mongodb` to troubleshoot MongoDB issues

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
5. Verify MongoDB is running: `docker ps`

---

**Status:** Phase 1 (MVP) Complete ✅
**Next:** Phase 2 - Chat Functionality
**Version:** 1.0.0
