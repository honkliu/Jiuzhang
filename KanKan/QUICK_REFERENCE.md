# Quick Reference Guide

## 🚀 Quick Start Commands
##  With Docker

 
```bash
In the host:
  docker network create kankan-net
  docker run -d --name kanapi --network kankan-net \
    -v "$(pwd)/server:/server" -w /server \
    mcr.microsoft.com/dotnet/sdk:9.0 \
    bash -lc "dotnet restore && dotnet run --urls http://0.0.0.0:5000"

  docker run -it --rm --name kanui --network kankan-net -p 80:3000 \
    -v "$(pwd)/client:/app" -w /app \
    node:20-bookworm-slim \
    bash -lc "npm install && npm run dev -- --host 0.0.0.0 --port 3000"
```
### Backend
```bash
cd server
dotnet restore        # Install dependencies
dotnet run           # Start server (http://localhost:5000)
dotnet watch run     # Start with hot reload
```

### Frontend
```bash
cd client
npm install          # Install dependencies
npm run dev          # Start dev server (http://localhost:3000)
npm run build        # Production build
npm run preview      # Preview production build
```

## 🔗 Important URLs

- **Frontend:** http://localhost:3000
- **Backend API:** http://localhost:5000
- **Swagger Docs:** http://localhost:5000
- **MongoDB Compass:** mongodb://localhost:27017

## 📋 Default Test Flow

1. **Start Backend:** `cd server && dotnet run`
2. **Start Frontend:** `cd client && npm run dev`
3. **Open Browser:** http://localhost:3000
4. **Register:**
   - Click "Create account"
   - Enter email: test@example.com
   - Check console for verification code
   - Complete registration
5. **Login:**
   - Use registered email and password
   - Click "Sign In"

## 🔑 Configuration Files

### Backend: `server/appsettings.json`
```json
{
  "StorageMode": "MongoDB",
  "MongoDB": {
    "ConnectionString": "mongodb://admin:password123@localhost:27017",
    "DatabaseName": "KanKanDB"
  },
  "Jwt": {
    "Secret": "your-super-secret-jwt-key-at-least-32-chars"
  }
}
```

### Frontend: `client/.env`
```env
VITE_API_URL=http://localhost:5000/api
```

## 📊 Database Collections

| Collection | Purpose |
|-----------|---------|
| Users | User accounts |
| UserEmailLookup | Email lookup |
| Messages | Chat messages |
| Chats | Chat metadata |
| ChatUsers | Per-user chat summaries |
| Contacts | User contacts |
| Moments | Timeline posts |
| EmailVerifications | Email codes (TTL: 600s) |
| Notifications | Notifications |

## 🎯 Key API Endpoints

### Auth
```
POST /api/auth/register          - Send verification code
POST /api/auth/verify-email      - Complete registration
POST /api/auth/login             - Login
POST /api/auth/logout            - Logout
POST /api/auth/refresh-token     - Refresh access token
POST /api/auth/forgot-password   - Reset password request
POST /api/auth/reset-password    - Reset password
```

## 🔧 Common Issues & Fixes

### "Port already in use"
```bash
# Windows
netstat -ano | findstr :5000
taskkill /PID <PID> /F

# Linux/Mac
lsof -i :5000
kill -9 <PID>
```

### "MongoDB connection failed"
- Start MongoDB with Docker:
  ```bash
  docker run -d --name mongodb -p 27017:27017 \
    -e MONGO_INITDB_ROOT_USERNAME=admin \
    -e MONGO_INITDB_ROOT_PASSWORD=password123 \
    mongo:latest
  ```
- Verify MongoDB is running: `docker ps`
- Check connection string in appsettings.json

### "Module not found" in React
```bash
cd client
rm -rf node_modules package-lock.json
npm install
```

### "JWT Secret not configured"
- Ensure `Jwt:Secret` in appsettings.json is 32+ characters

## 📦 Dependencies

### Backend (.NET 9)
- Microsoft.AspNetCore.Authentication.JwtBearer (8.0.0)
- MongoDB.Driver (2.25.0)
- BCrypt.Net-Next (4.0.3)
- SendGrid (9.28.1)
- Swashbuckle.AspNetCore (6.5.0)

### Frontend (Node 18+)
- react (18.2.0)
- typescript (5.3.0)
- @mui/material (5.15.0)
- @reduxjs/toolkit (2.0.0)
- axios (1.6.0)
- vite (5.0.0)

## 🎨 Theme Colors

- **Primary (Brand Green):** #07c160
- **Secondary (Brand Blue):** #576b95
- **Background:** #f5f5f5
- **Error:** #d32f2f
- **Success:** #2e7d32

## 📱 Responsive Breakpoints

- **Mobile:** < 600px
- **Tablet:** 600px - 960px
- **Desktop:** > 960px

## 🔐 Security Notes

- Access tokens expire in 15 minutes
- Refresh tokens expire in 7 days
- Passwords hashed with BCrypt (work factor 10)
- Refresh tokens stored in HTTP-only cookies
- CORS configured for localhost:3000

## 📝 File Locations

- **Backend Entry:** `server/Program.cs`
- **Frontend Entry:** `client/src/main.tsx`
- **Auth Controller:** `server/Controllers/AuthController.cs`
- **Auth Service:** `server/Services/Implementations/AuthService.cs`
- **Login Component:** `client/src/components/Auth/Login.tsx`
- **Register Component:** `client/src/components/Auth/Register.tsx`

## 🧪 Testing

### Manual Testing
1. Open Swagger UI: http://localhost:5000
2. Test endpoints directly
3. Use browser DevTools to inspect network requests

### Verification Code
- Check backend console for email verification codes
- Format: 6-digit number (e.g., 123456)

## 💡 Development Tips

1. Use `dotnet watch run` for backend hot reload
2. Frontend has Vite hot reload by default
3. Check console logs for verification codes
4. Use Redux DevTools browser extension
5. Test API endpoints in Swagger before integrating

## 📞 Quick Links

- **Architecture:** [Architecture.md](Architecture.md)
- **Setup Guide:** [GETTING_STARTED.md](GETTING_STARTED.md)
- **Summary:** [IMPLEMENTATION_SUMMARY.md](IMPLEMENTATION_SUMMARY.md)
- **Main README:** [README.md](README.md)

---

**Phase:** 1 (MVP) - Complete ✅
**Version:** 1.0.0
