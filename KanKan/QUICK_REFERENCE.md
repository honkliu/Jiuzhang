# Quick Reference Guide

## 🚀 Quick Start Commands
##  With Docker

 
```bash
In the Host: 
  cd Jiuzhang/Kankan & docker run --rm -it -p 5000:5000 -v "$(pwd):/src" -w /src mcr.microsoft.com/dotnet/sdk:8.0 bash
Inside the docker:
  dotnet restore server/KanKan.API.csproj
  dotnet run --project server/KanKan.API.csproj --urls http://0.0.0.0:5000
```
### Backend
```bash
cd server
dotnet restore        # Install dependencies
dotnet run           # Start server (http://localhost:5001)
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
- **Backend API:** http://localhost:5001
- **Swagger Docs:** http://localhost:5001
- **Cosmos DB Emulator:** https://localhost:8081/_explorer/index.html

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
  "CosmosDb": {
    "Endpoint": "https://localhost:8081",
    "Key": "C2y6yDjf5/R+ob0N8A7Cgv30VRDJIWEHLM+4QDU5DE2nQ9nDuVTqobD4b8mGGyPMbIZnqyMsEcaGQy67XIw/Jw==",
    "DatabaseName": "KanKanDB"
  },
  "Jwt": {
    "Secret": "your-super-secret-jwt-key-at-least-32-chars"
  }
}
```

### Frontend: `client/.env`
```env
VITE_API_URL=http://localhost:5001/api
```

## 📊 Database Containers

| Container | Partition Key | TTL | Purpose |
|-----------|---------------|-----|---------|
| Users | /id | - | User accounts |
| Messages | /chatId | - | Chat messages |
| Chats | /id | - | Chat metadata |
| Contacts | /userId | - | User contacts |
| Moments | /userId | - | Timeline posts |
| EmailVerifications | /email | 600s | Email codes |

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

### "Cosmos DB connection failed"
- Install Cosmos DB Emulator
- Start emulator before running backend
- Use correct endpoint and key

### "Module not found" in React
```bash
cd client
rm -rf node_modules package-lock.json
npm install
```

### "JWT Secret not configured"
- Ensure `Jwt:Secret` in appsettings.json is 32+ characters

## 📦 Dependencies

### Backend (.NET 8)
- Microsoft.AspNetCore.Authentication.JwtBearer (8.0.0)
- Microsoft.Azure.Cosmos (3.38.0)
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
1. Open Swagger UI: http://localhost:5001
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
