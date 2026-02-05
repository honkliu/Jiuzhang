# KanKan Application Architecture

## Table of Contents
1. [System Architecture Overview](#system-architecture-overview)
2. [Client Side - React Web Application](#client-side---react-web-application)
3. [API Side - .NET Core](#api-side---net-core)
4. [Database Design - Cosmos DB](#database-design---cosmos-db)
5. [Server Infrastructure - Azure](#server-infrastructure---azure)
6. [Authentication System](#authentication-system)
7. [Security Design](#security-design)
8. [Scalability Considerations](#scalability-considerations)
9. [Implementation Roadmap](#implementation-roadmap)

---

## System Architecture Overview

```
┌─────────────────┐
│  React Client   │
│   (Web/PWA)     │
└────────┬────────┘
         │ HTTPS/WSS
         ▼
┌─────────────────┐
│   API Gateway   │
│  (.NET Core)    │
└────────┬────────┘
         │
    ┌────┴────┬──────────┬──────────┐
    ▼         ▼          ▼          ▼
┌────────┐ ┌─────┐ ┌──────────┐ ┌────────┐
│ Auth   │ │ Chat│ │  Media   │ │ Notif  │
│Service │ │ Svc │ │ Service  │ │Service │
└───┬────┘ └──┬──┘ └────┬─────┘ └───┬────┘
    │         │         │           │
    └─────────┴─────────┴───────────┘
                    ▼
            ┌──────────────┐
            │  Cosmos DB   │
            └──────────────┘
```

### Key Components
- **Client Layer**: React-based web application with PWA capabilities
- **API Layer**: .NET Core 8 RESTful API with SignalR for real-time communication
- **Data Layer**: Azure Cosmos DB for scalable NoSQL storage
- **Storage Layer**: Azure Blob Storage for media files
- **Infrastructure**: Azure cloud services with multi-region support

---

## Client Side - React Web Application

### Technology Stack

| Technology | Purpose |
|------------|---------|
| React 18+ | UI framework |
| TypeScript | Type safety |
| Redux Toolkit / Zustand | State management |
| Material-UI / Ant Design | UI components |
| SignalR Client | WebSocket real-time communication |
| React Router v6 | Client-side routing |
| Axios | HTTP client |
| Service Workers | PWA offline support |

### Component Structure

```
src/
├── components/
│   ├── Auth/
│   │   ├── Login.tsx
│   │   ├── Register.tsx
│   │   ├── VerifyEmail.tsx
│   │   └── ForgotPassword.tsx
│   ├── Chat/
│   │   ├── ChatLayout.tsx
│   │   ├── ChatList.tsx
│   │   ├── ChatWindow.tsx
│   │   ├── MessageList.tsx
│   │   ├── MessageBubble.tsx
│   │   ├── MessageInput.tsx
│   │   └── VoiceRecorder.tsx
│   ├── Contacts/
│   │   ├── ContactList.tsx
│   │   ├── ContactCard.tsx
│   │   ├── AddContact.tsx
│   │   └── FriendRequests.tsx
│   ├── Moments/ (Timeline/Feed)
│   │   ├── MomentsList.tsx
│   │   ├── MomentCard.tsx
│   │   └── CreateMoment.tsx
│   ├── Profile/
│   │   ├── UserProfile.tsx
│   │   ├── EditProfile.tsx
│   │   └── Settings.tsx
│   └── Shared/
│       ├── Avatar.tsx
│       ├── ImagePreview.tsx
│       ├── VideoPlayer.tsx
│       └── FileUploader.tsx
├── services/
│   ├── api.service.ts
│   ├── auth.service.ts
│   ├── chat.service.ts
│   ├── signalr.service.ts
│   └── media.service.ts
├── store/
│   ├── authSlice.ts
│   ├── chatSlice.ts
│   └── contactSlice.ts
├── hooks/
│   ├── useSignalR.ts
│   ├── useInfiniteScroll.ts
│   └── useMediaUpload.ts
└── types/
    └── index.ts
```

### Key Features

#### 1. Authentication
- Email-based registration with verification code
- Login with email and password
- Password reset functionality
- JWT token-based authentication
- Refresh token mechanism (HTTP-only cookies)

#### 2. Real-time Messaging
- 1-on-1 direct chats
- Group chats with multiple participants
- Message types supported:
  - Text messages
  - Image messages (JPEG, PNG, GIF, WebP)
  - Video messages (MP4, MOV, WebM)
  - Voice messages (MP3, WAV, WebM, OGG)
  - File attachments (PDF, DOC, XLS, ZIP, etc.)
- Message reactions (emojis)
- Message replies
- Read receipts (double check marks)
- Typing indicators
- Message delivery status

#### 3. User Interface
- Responsive design (mobile, tablet, desktop)
- Dark/light theme support
- Infinite scroll for message history
- Image/video preview and lightbox
- Drag-and-drop file upload
- Emoji picker
- Voice message recording
- Online/offline status indicators

#### 4. Offline Support
- Service worker caching
- Message queue for offline sending
- Local storage for message cache
- Progressive Web App (PWA) capabilities

---

## API Side - .NET Core

### Technology Stack

| Technology | Purpose |
|------------|---------|
| .NET 8 | Framework |
| ASP.NET Core Web API | RESTful API |
| SignalR | WebSocket communication |
| Azure Cosmos DB SDK | Database access |
| Azure Blob Storage SDK | Media storage |
| JWT Bearer Authentication | Security |
| BCrypt.NET | Password hashing |
| Serilog | Logging |

### Project Structure

```
KanKan.API/
├── Controllers/
│   ├── AuthController.cs
│   ├── ChatController.cs
│   ├── ContactController.cs
│   ├── MomentsController.cs
│   └── MediaController.cs
├── Hubs/
│   └── ChatHub.cs (SignalR)
├── Services/
│   ├── Interfaces/
│   │   ├── IAuthService.cs
│   │   ├── IChatService.cs
│   │   ├── IContactService.cs
│   │   ├── IMediaService.cs
│   │   └── IEmailService.cs
│   └── Implementations/
│       ├── AuthService.cs
│       ├── ChatService.cs
│       ├── ContactService.cs
│       ├── MediaService.cs
│       └── EmailService.cs
├── Repositories/
│   ├── Interfaces/
│   │   ├── IUserRepository.cs
│   │   ├── IChatRepository.cs
│   │   └── IMessageRepository.cs
│   └── Implementations/
│       ├── UserRepository.cs
│       ├── ChatRepository.cs
│       └── MessageRepository.cs
├── Models/
│   ├── DTOs/
│   │   ├── Auth/
│   │   │   ├── RegisterRequest.cs
│   │   │   ├── LoginRequest.cs
│   │   │   └── AuthResponse.cs
│   │   ├── Chat/
│   │   │   ├── MessageDto.cs
│   │   │   ├── ChatDto.cs
│   │   │   └── CreateChatRequest.cs
│   │   └── User/
│   │       └── UserDto.cs
│   └── Entities/
│       ├── User.cs
│       ├── Message.cs
│       ├── Chat.cs
│       ├── Contact.cs
│       └── EmailVerification.cs
├── Middleware/
│   ├── JwtMiddleware.cs
│   ├── ExceptionMiddleware.cs
│   └── RateLimitMiddleware.cs
└── Program.cs
```

### API Endpoints

#### Authentication Endpoints

```
POST   /api/auth/register            # Send verification code to email
POST   /api/auth/verify-email        # Verify code and create account
POST   /api/auth/login               # Login with email/password
POST   /api/auth/logout              # Logout and revoke refresh token
POST   /api/auth/refresh-token       # Refresh access token
POST   /api/auth/forgot-password     # Send password reset code
POST   /api/auth/reset-password      # Reset password with code
```

#### Chat Endpoints

For Wa-specific behavior, avatar rules, per-user clear semantics, and group rename/admin rules, see [CHAT_DETAILED_DESIGN.md](CHAT_DETAILED_DESIGN.md).

```
GET    /api/chat                     # Get user's chat list
GET    /api/chat/{chatId}            # Get chat details (may unhide for current user)
POST   /api/chat                     # Create new chat (direct or group)
PUT    /api/chat/{chatId}            # Update chat (group name, avatar)
DELETE /api/chat/{chatId}            # Delete/leave chat

POST   /api/chat/{chatId}/hide       # Hide chat for current user
POST   /api/chat/{chatId}/unhide     # Unhide chat for current user
POST   /api/chat/{chatId}/clear      # Clear chat history for current user

GET    /api/chat/{chatId}/messages   # Get messages (paginated; filtered by clearedAt)
POST   /api/chat/{chatId}/messages   # Send message
DELETE /api/chat/{chatId}/messages/{messageId}  # Delete message

POST   /api/chat/{chatId}/participants           # Add group members
DELETE /api/chat/{chatId}/participants/{userId}  # Remove member
```

#### Contact Endpoints

```
GET    /api/contacts                 # Get contact list
GET    /api/contacts/search?q={query}  # Search users by email/name
POST   /api/contacts/request         # Send friend request
POST   /api/contacts/accept/{requestId}  # Accept friend request
POST   /api/contacts/reject/{requestId}  # Reject friend request
DELETE /api/contacts/{userId}        # Remove contact
POST   /api/contacts/{userId}/block  # Block user
```

#### Media Endpoints

```
POST   /api/media/upload             # Upload media file (multipart/form-data)
GET    /api/media/{fileId}           # Get media file
DELETE /api/media/{fileId}           # Delete media file
```

#### Moments Endpoints

```
GET    /api/moments                  # Get timeline/feed
GET    /api/moments/{id}             # Get moment details
POST   /api/moments                  # Create new moment
DELETE /api/moments/{id}             # Delete moment
POST   /api/moments/{id}/like        # Like/unlike moment
POST   /api/moments/{id}/comment     # Add comment
DELETE /api/moments/{id}/comments/{commentId}  # Delete comment
```

### SignalR Hub

#### ChatHub Methods

**Client → Server:**
```csharp
Task SendMessage(string chatId, string message)
Task JoinChat(string chatId)
Task LeaveChat(string chatId)
Task TypingIndicator(string chatId, bool isTyping)
Task MessageRead(string chatId, string messageId)
Task MessageDelivered(string chatId, string messageId)
```

**Server → Client:**
```csharp
Task ReceiveMessage(Message message)
Task UserTyping(string chatId, string userId, bool isTyping)
Task MessageDelivered(string messageId, string userId)
Task MessageRead(string messageId, string userId)
Task UserOnline(string userId)
Task UserOffline(string userId)
Task ChatUpdated(Chat chat)
```

---

## Database Design - Cosmos DB

### Container Strategy

Cosmos DB organizes data into containers with partition keys for optimal performance.

```
Database: KanKanDB

Containers:
1. Users           (Partition Key: /id)
2. Messages        (Partition Key: /chatId)
3. Chats           (Partition Key: /id)
4. Contacts        (Partition Key: /userId)
5. Moments         (Partition Key: /userId)
6. EmailVerifications  (Partition Key: /email, TTL: 600 seconds)
```

### Data Models

#### 1. Users Container

```json
{
  "id": "user_123",
  "type": "user",
  "email": "john.doe@example.com",
  "emailVerified": true,
  "passwordHash": "$2b$10$...",
  "handle": "john_doe_123",
  "displayName": "John Doe",
  "avatarUrl": "https://storage.../avatars/user_123.jpg",
  "bio": "Hello, I'm using KanKan!",
  "phoneNumber": "+1234567890",
  "isOnline": true,
  "lastSeen": "2024-01-15T10:30:00Z",
  "createdAt": "2024-01-01T00:00:00Z",
  "updatedAt": "2024-01-15T10:30:00Z",
  "settings": {
    "privacy": "friends",
    "notifications": true,
    "language": "en",
    "theme": "light"
  },
  "refreshTokens": [
    {
      "token": "hashed_refresh_token",
      "expiresAt": "2024-01-22T10:30:00Z",
      "createdByIp": "192.168.1.1"
    }
  ]
}
```

#### 2. Chats Container

```json
{
  "id": "chat_456",
  "type": "chat",
  "chatType": "direct",  // "direct" or "group" (UI may derive group-ness from participants)
  "participants": [
    {
      "userId": "user_123",
      "displayName": "John Doe",
      "avatarUrl": "https://...",
      "gender": "male",
      "joinedAt": "2024-01-10T00:00:00Z",
      "isHidden": false,
      "clearedAt": null
    },
    {
      "userId": "user_789",
      "displayName": "Jane Smith",
      "avatarUrl": "https://...",
      "gender": "female",
      "joinedAt": "2024-01-10T00:00:00Z",
      "isHidden": false,
      "clearedAt": null
    }
  ],
  "groupName": null,  // for group chats
  "groupAvatar": null,
  "adminIds": [],  // for group chats
  "lastMessage": {
    "text": "Hello!",
    "senderId": "user_123",
    "senderName": "John Doe",
    "messageType": "text",
    "timestamp": "2024-01-15T10:30:00Z"
  },
  "createdAt": "2024-01-10T00:00:00Z",
  "updatedAt": "2024-01-15T10:30:00Z"
}
```

#### 3. Messages Container (Partitioned by chatId)

```json
{
  "id": "msg_789",
  "chatId": "chat_456",
  "type": "message",
  "senderId": "user_123",
  "senderName": "John Doe",
  "senderAvatar": "https://...",
  "messageType": "text",  // text, image, video, voice, file
  "content": {
    "text": "Hello, how are you?",
    "mediaUrl": null,
    "thumbnailUrl": null,
    "duration": null,  // for voice/video (in seconds)
    "fileName": null,  // for files
    "fileSize": null   // for files
  },
  "replyTo": null,  // messageId of the message being replied to
  "timestamp": "2024-01-15T10:30:00Z",
  "deliveredTo": ["user_789"],
  "readBy": [],
  "reactions": {
    "user_789": "👍"
  },
  "isDeleted": false,
  "deletedAt": null,
  "ttl": null  // optional auto-delete after X seconds
}
```

#### 4. Contacts Container (Partitioned by userId)

```json
{
  "id": "contact_001",
  "userId": "user_123",
  "type": "contact",
  "contactId": "user_789",
  "displayName": "Jane Smith",
  "remark": "Colleague",  // custom display name
  "status": "accepted",  // pending, accepted, blocked
  "addedAt": "2024-01-05T00:00:00Z",
  "tags": ["work", "friends"],
  "isFavorite": false,
  "lastInteraction": "2024-01-15T10:30:00Z"
}
```

#### 5. Moments Container (Partitioned by userId)

```json
{
  "id": "moment_111",
  "userId": "user_123",
  "type": "moment",
  "userName": "John Doe",
  "userAvatar": "https://...",
  "content": {
    "text": "Beautiful sunset today!",
    "mediaUrls": [
      "https://storage.../moments/img1.jpg",
      "https://storage.../moments/img2.jpg"
    ],
    "location": "San Francisco, CA"
  },
  "visibility": "friends",  // public, friends, private
  "createdAt": "2024-01-15T18:00:00Z",
  "likes": [
    {
      "userId": "user_789",
      "userName": "Jane Smith",
      "timestamp": "2024-01-15T18:02:00Z"
    }
  ],
  "comments": [
    {
      "id": "comment_001",
      "userId": "user_789",
      "userName": "Jane Smith",
      "userAvatar": "https://...",
      "text": "Looks amazing!",
      "timestamp": "2024-01-15T18:05:00Z"
    }
  ]
}
```

#### 6. EmailVerification Container (Partitioned by email)

```json
{
  "id": "verify_456",
  "type": "email_verification",
  "email": "john.doe@example.com",
  "verificationCode": "123456",
  "purpose": "registration",  // or "password_reset"
  "expiresAt": "2024-01-15T10:40:00Z",
  "isUsed": false,
  "createdAt": "2024-01-15T10:30:00Z",
  "ttl": 600  // auto-delete after 10 minutes
}
```

### Indexing Strategy

```json
{
  "indexingMode": "consistent",
  "automatic": true,
  "includedPaths": [
    { "path": "/*" },
    { "path": "/timestamp/?", "indexes": [{"kind": "Range"}] },
    { "path": "/userId/?", "indexes": [{"kind": "Hash"}] },
    { "path": "/chatId/?", "indexes": [{"kind": "Hash"}] },
    { "path": "/email/?", "indexes": [{"kind": "Hash"}] }
  ],
  "excludedPaths": [
    { "path": "/content/*" },
    { "path": "/passwordHash/*" },
    { "path": "/refreshTokens/*" }
  ]
}
```

### Cosmos DB Best Practices

1. **Partition Key Selection**:
   - Messages partitioned by `chatId` for efficient chat queries
   - Contacts partitioned by `userId` for fast friend list retrieval
   - Choose partition keys with high cardinality

2. **TTL (Time To Live)**:
   - Email verification codes auto-delete after 10 minutes
   - Optional message expiration for ephemeral chats
   - Reduced storage costs

3. **Change Feed**:
   - Real-time sync with SignalR
   - Analytics and reporting
   - Backup and disaster recovery

4. **Query Optimization**:
   - Use partition key in queries whenever possible
   - Avoid cross-partition queries
   - Implement pagination for large result sets

---

## Server Infrastructure - Azure

### Azure Services Architecture

```
┌──────────────────────────────────────────┐
│         Azure Front Door / CDN           │
│      (Global load balancing + SSL)       │
└──────────────┬───────────────────────────┘
               │
┌──────────────▼───────────────────────────┐
│      Azure App Service / AKS             │
│    (.NET Core API + SignalR Hub)         │
│         Multiple instances               │
└──────────────┬───────────────────────────┘
               │
      ┌────────┼────────┬──────────┐
      ▼        ▼        ▼          ▼
┌──────────┐ ┌────────────┐ ┌──────────────┐ ┌───────────┐
│ Cosmos DB│ │Azure Blob  │ │Azure SignalR │ │Azure Redis│
│          │ │Storage     │ │Service       │ │Cache      │
└──────────┘ └────────────┘ └──────────────┘ └───────────┘
      │              │              │              │
      └──────────────┴──────────────┴──────────────┘
                     ▼
          ┌──────────────────────────┐
          │ Azure Monitor +          │
          │ Application Insights     │
          └──────────────────────────┘
                     │
                     ▼
          ┌──────────────────────────┐
          │ Azure Notification Hub   │
          │ (Push Notifications)     │
          └──────────────────────────┘
```

### Infrastructure Components

#### 1. Azure App Service / Azure Kubernetes Service (AKS)

**Azure App Service:**
- Easy deployment and management
- Built-in auto-scaling
- Multiple deployment slots (dev, staging, prod)
- Good for MVP and medium-scale applications

**Azure Kubernetes Service (Recommended for scale):**
- Containerized microservices architecture
- Advanced scaling capabilities
- Better resource utilization
- Multi-region deployment

**Configuration:**
```yaml
# Deployment specs
- Minimum Instances: 2 (HA)
- Maximum Instances: 20 (auto-scale)
- CPU Threshold: 70%
- Memory Threshold: 80%
- Health Check: /health endpoint
```

#### 2. Azure SignalR Service

- Managed SignalR for WebSocket connections
- Handles millions of concurrent connections
- Automatic scaling and load balancing
- Reduces server load for real-time features

**Tiers:**
- **Free**: Up to 20 concurrent connections (development)
- **Standard**: Up to 1000 concurrent connections per unit
- **Premium**: Up to 100K concurrent connections per unit

#### 3. Azure Cosmos DB

**Configuration:**
- **API**: Core (SQL)
- **Consistency Level**: Session (balance between consistency and performance)
- **Multi-region**: Read replicas in major regions
- **Backup**: Continuous backup with point-in-time restore
- **Throughput**: Auto-scale (400-10,000 RU/s per container)

**Cost Optimization:**
- Use TTL for temporary data
- Optimize partition keys
- Use bulk operations
- Monitor and adjust RU/s based on usage

#### 4. Azure Blob Storage

**Containers:**
- `images`: User avatars, moment photos, image messages
- `videos`: Video messages, moment videos
- `voice-messages`: Voice message recordings
- `files`: Document attachments
- `thumbnails`: Generated thumbnails for media

**Configuration:**
- **Tier**: Hot (frequently accessed media)
- **Redundancy**: GRS (Geo-redundant storage)
- **CDN**: Azure CDN for global delivery
- **Lifecycle Management**: Move old files to Cool/Archive tiers

#### 5. Azure Redis Cache

**Use Cases:**
- Session storage
- User online status
- Rate limiting counters
- Frequently accessed data (user profiles, chat lists)
- Temporary typing indicators

**Configuration:**
- **Tier**: Standard or Premium
- **Size**: C1 (1GB) to C6 (53GB) based on load
- **Clustering**: Enabled for Premium tier

#### 6. Azure CDN

- Cache static assets (images, videos, CSS, JS)
- Reduce latency globally
- Offload traffic from origin servers
- Support for custom domains and SSL

#### 7. Azure Key Vault

Store sensitive configuration:
- Database connection strings
- JWT signing keys
- Azure Storage account keys
- Third-party API keys
- SSL certificates

#### 8. Azure Application Insights

**Monitoring:**
- Request rate, response time, failure rate
- Dependency tracking (Cosmos DB, Blob Storage)
- Custom events and metrics
- Real-time analytics
- Alerts and notifications

**Key Metrics:**
- API response times
- SignalR connection count
- Database RU/s consumption
- Error rates and exceptions
- User engagement metrics

#### 9. Azure Notification Hub

- Push notifications to web browsers
- Support for APNS (iOS), FCM (Android), WNS (Windows)
- Tag-based targeting
- Template-based notifications
- Analytics and reporting

#### 10. Azure Service Bus (Optional)

**Use Cases:**
- Asynchronous message processing
- Email sending queue
- Push notification queue
- Image processing queue (thumbnail generation)
- Analytics events

---

## Authentication System

### Email-Based Registration & Login Flow

#### Registration Flow

```
1. User enters email → POST /api/auth/register
   ↓
2. Server generates 6-digit code (123456)
   ↓
3. Code stored in EmailVerification container (TTL: 10 min)
   ↓
4. Email sent via SendGrid/AWS SES
   ↓
5. User enters: code, password, display name
   ↓
6. POST /api/auth/verify-email
   ↓
7. Server validates code
   ↓
8. User account created
   ↓
9. JWT access token + refresh token returned
   ↓
10. User redirected to main app
```

#### Login Flow

```
1. User enters email + password → POST /api/auth/login
   ↓
2. Server validates credentials (BCrypt.Verify)
   ↓
3. Check if email is verified
   ↓
4. Generate JWT access token (15 min expiry)
   ↓
5. Generate refresh token (7 days expiry)
   ↓
6. Refresh token stored in HTTP-only cookie
   ↓
7. Access token returned in response body
   ↓
8. User redirected to main app
```

#### Token Refresh Flow

```
1. Access token expires (15 minutes)
   ↓
2. Client detects 401 Unauthorized
   ↓
3. POST /api/auth/refresh-token (with refresh token cookie)
   ↓
4. Server validates refresh token
   ↓
5. New access token generated
   ↓
6. New refresh token generated (rotation)
   ↓
7. Old refresh token revoked
   ↓
8. New tokens returned
   ↓
9. Client retries original request
```

#### Password Reset Flow

```
1. User clicks "Forgot Password"
   ↓
2. User enters email → POST /api/auth/forgot-password
   ↓
3. Server generates 6-digit reset code
   ↓
4. Code stored with purpose: "password_reset"
   ↓
5. Email sent with reset code
   ↓
6. User enters: email, code, new password
   ↓
7. POST /api/auth/reset-password
   ↓
8. Server validates code
   ↓
9. Password updated (BCrypt.HashPassword)
   ↓
10. Success response
```

### JWT Token Structure

**Access Token (15 minutes):**
```json
{
  "sub": "user_123",
  "email": "john.doe@example.com",
  "name": "John Doe",
  "exp": 1705329000,
  "iat": 1705328100
}
```

**Refresh Token (7 days):**
```json
{
  "token": "base64_encoded_random_bytes",
  "userId": "user_123",
  "expiresAt": "2024-01-22T10:30:00Z",
  "createdByIp": "192.168.1.1"
}
```

### Password Security

- **Hashing Algorithm**: BCrypt with work factor 10
- **Minimum Length**: 8 characters
- **Complexity**: No strict requirements (user-friendly)
- **Storage**: Hashed password stored in Users container
- **No Plain Text**: Never stored or logged

---

## Security Design

### 1. Transport Security

- **HTTPS Only**: TLS 1.3 for all communications
- **HSTS**: HTTP Strict Transport Security enabled
- **Certificate**: Azure-managed SSL certificates
- **WebSocket Security**: WSS (WebSocket Secure)

### 2. Authentication & Authorization

- **JWT Tokens**: Access token (15 min) + Refresh token (7 days)
- **HTTP-Only Cookies**: Refresh tokens stored in secure cookies
- **Token Rotation**: New refresh token on each refresh
- **Token Revocation**: Logout revokes refresh tokens
- **Role-Based Access**: Future support for admin/moderator roles

### 3. API Security

- **CORS**: Whitelist allowed origins
- **Rate Limiting**:
  - Registration: 3 attempts per hour per IP
  - Login: 5 attempts per hour per email
  - API calls: 100 requests per minute per user
- **Input Validation**:
  - Email format validation
  - File type and size validation
  - SQL injection prevention (NoSQL)
  - XSS prevention
- **Request Size Limits**:
  - Images: 10MB max
  - Videos: 100MB max
  - Files: 50MB max

### 4. Data Security

- **Encryption at Rest**: Cosmos DB and Blob Storage encrypted
- **Encryption in Transit**: All data transmitted over HTTPS/WSS
- **Password Hashing**: BCrypt with salt
- **Sensitive Data**: Stored in Azure Key Vault
- **PII Protection**: GDPR compliance considerations

### 5. SignalR Security

- **Authentication**: JWT required for WebSocket connection
- **Authorization**: Users can only join their own chats
- **Message Validation**: Server-side validation of all messages
- **Connection Limits**: Max connections per user

### 6. File Upload Security

- **File Type Validation**: Whitelist allowed extensions
- **Content Type Verification**: Check actual file content
- **Virus Scanning**: Azure Defender for Storage (optional)
- **File Size Limits**: Enforced at API level
- **Malicious Content**: Block executable files

### 7. Privacy & Compliance

- **Data Retention**: Configurable message retention policies
- **Right to Delete**: Users can delete their accounts
- **Data Export**: Users can export their data
- **GDPR Compliance**: Data processing transparency
- **Terms of Service**: User consent required

---

## Scalability Considerations

### 1. Horizontal Scaling

**API Layer:**
- Multiple instances behind Azure Load Balancer
- Stateless design (no session affinity required)
- Auto-scaling based on CPU/memory/request count

**SignalR:**
- Azure SignalR Service handles distribution
- Supports millions of concurrent connections
- Automatic scaling and failover

### 2. Database Optimization

**Cosmos DB:**
- Partition keys for even data distribution
- Messages partitioned by `chatId` (hot partition prevention)
- Auto-scale RU/s (400 to 10,000+)
- Multi-region replication for global availability

**Indexing:**
- Index only necessary fields
- Exclude large text fields and binary data
- Use composite indexes for common queries

**Queries:**
- Always include partition key
- Use continuation tokens for pagination
- Limit result set size (50-100 items per page)

### 3. Caching Strategy

**Redis Cache:**
- User profiles (5-minute TTL)
- Chat lists (1-minute TTL)
- Online user status (real-time)
- Rate limiting counters

**Client-Side Caching:**
- Service Worker for offline support
- LocalStorage for user preferences
- IndexedDB for message history

**CDN Caching:**
- Static assets (images, videos): 7-day cache
- Media thumbnails: 30-day cache
- User avatars: 1-day cache (with cache busting)

### 4. Media Optimization

**Image Processing:**
- Automatic thumbnail generation (150x150, 300x300)
- Image compression (WebP format)
- Lazy loading in UI
- Progressive JPEG for large images

**Video Processing:**
- Transcode to optimized formats (H.264, WebM)
- Generate preview thumbnails
- Adaptive bitrate streaming (future)

**Voice Messages:**
- Compress audio (Opus codec)
- Limit duration (max 60 seconds)

### 5. Message Queue

**Azure Service Bus:**
- Decouple long-running operations
- Email sending queue
- Push notification queue
- Media processing queue (thumbnails, compression)
- Analytics event queue

### 6. Database Sharding

**Future Considerations:**
- Shard messages by date ranges
- Archive old messages to cheaper storage
- Implement message history pagination

### 7. Load Testing

**Targets:**
- 10,000 concurrent users
- 100,000 messages per minute
- 1,000 new registrations per hour
- 99.9% uptime SLA

**Tools:**
- Azure Load Testing
- Apache JMeter
- K6 load testing

---

## Implementation Roadmap

### Phase 1: MVP - Core Messaging (4-6 weeks)

**Week 1-2: Foundation**
- [ ] Project setup (React + .NET Core)
- [ ] Azure infrastructure provisioning
- [ ] Cosmos DB schema design
- [ ] Authentication system (email-based)
- [ ] User registration and login UI

**Week 3-4: Core Chat**
- [ ] 1-on-1 chat functionality
- [ ] Text message sending/receiving
- [ ] SignalR real-time communication
- [ ] Message persistence in Cosmos DB
- [ ] Basic chat list UI
- [ ] Chat window UI

**Week 5-6: Polish & Deploy**
- [ ] Message delivery status
- [ ] Read receipts
- [ ] Typing indicators
- [ ] Basic error handling
- [ ] Deployment to Azure
- [ ] MVP testing

**Deliverables:**
- Working authentication system
- 1-on-1 text messaging
- Real-time message delivery
- Deployed to Azure

---

### Phase 2: Enhanced Messaging (4-6 weeks)

**Week 7-8: Group Chats**
- [ ] Group chat creation
- [ ] Add/remove participants
- [ ] Group settings (name, avatar)
- [ ] Group admin management
- [ ] Group message broadcasting

**Week 9-10: Media Messages**
- [ ] Image upload and display
- [ ] Video upload and playback
- [ ] File attachment support
- [ ] Azure Blob Storage integration
- [ ] Thumbnail generation
- [ ] Image preview/lightbox

**Week 11-12: Voice & Reactions**
- [ ] Voice message recording
- [ ] Voice message playback
- [ ] Message reactions (emojis)
- [ ] Message replies/threading
- [ ] Message forwarding
- [ ] Message deletion

**Deliverables:**
- Group chat functionality
- Rich media support (images, videos, files)
- Voice messages
- Message reactions and replies

---

### Phase 3: Social Features (4-6 weeks)

**Week 13-14: Contacts**
- [ ] Contact list management
- [ ] Friend request system
- [ ] Contact search by email/name
- [ ] Block/unblock users
- [ ] Contact tags and favorites
- [ ] Contact sync

**Week 15-16: User Profiles**
- [ ] User profile page
- [ ] Profile editing (avatar, bio, display name)
- [ ] Privacy settings
- [ ] Notification settings
- [ ] Account settings
- [ ] Theme support (dark/light)

**Week 17-18: Moments/Timeline**
- [ ] Create moment (post)
- [ ] Upload photos to moment
- [ ] Moment feed/timeline
- [ ] Like moments
- [ ] Comment on moments
- [ ] Moment privacy settings

**Deliverables:**
- Complete contact management
- Rich user profiles
- Social timeline (Moments)
- Privacy controls

---

### Phase 4: Advanced Features (6-8 weeks)

**Week 19-21: Voice/Video Calls**
- [ ] WebRTC integration
- [ ] 1-on-1 voice calls
- [ ] 1-on-1 video calls
- [ ] Call notifications
- [ ] Call history
- [ ] Group voice calls (optional)

**Week 22-23: Search & Discovery**
- [ ] Message search within chats
- [ ] Global search (chats, contacts, messages)
- [ ] Advanced filters
- [ ] Search indexing optimization

**Week 24-25: Notifications**
- [ ] Web push notifications
- [ ] In-app notifications
- [ ] Notification preferences
- [ ] Notification history
- [ ] Badge counts

**Week 26: Performance & Optimization**
- [ ] Performance profiling
- [ ] Query optimization
- [ ] Caching improvements
- [ ] Load testing
- [ ] Security audit

**Deliverables:**
- Voice/video calling
- Advanced search
- Push notifications
- Performance optimizations

---

### Phase 5: Enterprise Features (Optional)

**Advanced Features:**
- [ ] End-to-end encryption
- [ ] Message scheduling
- [ ] Auto-reply/chatbots
- [ ] Mini programs/apps within app
- [ ] Payment integration
- [ ] Sticker marketplace
- [ ] Channel/broadcast feature
- [ ] Analytics dashboard
- [ ] Admin panel
- [ ] Multi-language support

**DevOps & Monitoring:**
- [ ] CI/CD pipelines
- [ ] Automated testing (unit, integration, E2E)
- [ ] Monitoring dashboards
- [ ] Alerting system
- [ ] Log aggregation
- [ ] Performance monitoring
- [ ] Cost optimization

---

## Technology Versions & Dependencies

### Frontend

```json
{
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "react-router-dom": "^6.20.0",
    "@reduxjs/toolkit": "^2.0.0",
    "react-redux": "^9.0.0",
    "@mui/material": "^5.15.0",
    "@mui/icons-material": "^5.15.0",
    "@microsoft/signalr": "^8.0.0",
    "axios": "^1.6.0",
    "date-fns": "^3.0.0",
    "formik": "^2.4.0",
    "yup": "^1.3.0"
  },
  "devDependencies": {
    "typescript": "^5.3.0",
    "vite": "^5.0.0",
    "@types/react": "^18.2.0",
    "@types/react-dom": "^18.2.0"
  }
}
```

### Backend

```xml
<ItemGroup>
  <PackageReference Include="Microsoft.AspNetCore.Authentication.JwtBearer" Version="8.0.0" />
  <PackageReference Include="Microsoft.AspNetCore.SignalR" Version="8.0.0" />
  <PackageReference Include="Microsoft.Azure.Cosmos" Version="3.38.0" />
  <PackageReference Include="Azure.Storage.Blobs" Version="12.19.0" />
  <PackageReference Include="BCrypt.Net-Next" Version="4.0.3" />
  <PackageReference Include="Serilog.AspNetCore" Version="8.0.0" />
  <PackageReference Include="Swashbuckle.AspNetCore" Version="6.5.0" />
  <PackageReference Include="StackExchange.Redis" Version="2.7.0" />
</ItemGroup>
```

---

## Appendix

### A. Environment Configuration

**.env (Client)**
```
REACT_APP_API_URL=https://api.kankan.example.com
REACT_APP_SIGNALR_URL=https://api.kankan.example.com/hub
REACT_APP_CDN_URL=https://cdn.kankan.example.com

```

**appsettings.json (Server)**
```json
{
  "CosmosDb": {
    "Endpoint": "https://kankan-db.documents.azure.com:443/",
    "Key": "stored-in-key-vault",
    "DatabaseName": "KanKanDB"
  },
  "AzureStorage": {
    "ConnectionString": "stored-in-key-vault",
    "ContainerNames": {
      "Images": "images",
      "Videos": "videos",
      "Voice": "voice-messages",
      "Files": "files"
    }
  },
  "Jwt": {
    "Secret": "stored-in-key-vault",
    "AccessTokenExpirationMinutes": 15,
    "RefreshTokenExpirationDays": 7
  },
  "SignalR": {
    "ConnectionString": "stored-in-key-vault"
  },
  "Redis": {
    "ConnectionString": "stored-in-key-vault"
  },
  "Email": {
    "Provider": "SendGrid",
    "ApiKey": "stored-in-key-vault",
    "FromEmail": "noreply@kankan.example.com",
    "FromName": "KanKan"
  }
}
```

### B. Cost Estimation (Monthly)

**Small Scale (1K users, 10K messages/day):**
- Azure App Service: $50
- Azure Cosmos DB: $100
- Azure Blob Storage: $20
- Azure SignalR Service: $50
- Azure Redis Cache: $30
- Total: ~$250/month

**Medium Scale (50K users, 500K messages/day):**
- Azure App Service / AKS: $300
- Azure Cosmos DB: $500
- Azure Blob Storage: $100
- Azure SignalR Service: $200
- Azure Redis Cache: $100
- Azure CDN: $50
- Total: ~$1,250/month

**Large Scale (500K users, 5M messages/day):**
- Azure Kubernetes Service: $1,000
- Azure Cosmos DB: $2,000
- Azure Blob Storage: $500
- Azure SignalR Service: $800
- Azure Redis Cache: $300
- Azure CDN: $200
- Total: ~$4,800/month

---

## Conclusion

This architecture provides a robust, scalable foundation for building a real-time messaging application using modern technologies:

- **React** for a responsive, interactive client
- **.NET Core** for a high-performance, secure API
- **Cosmos DB** for globally distributed, scalable data storage
- **Azure** for enterprise-grade cloud infrastructure

The design emphasizes:
- ✅ Email-based authentication for worldwide accessibility
- ✅ Real-time messaging with SignalR
- ✅ Rich media support (text, images, videos, voice, files)
- ✅ Scalability from MVP to millions of users
- ✅ Security best practices
- ✅ Cost optimization strategies

**Next Steps:**
1. Set up development environment
2. Provision Azure resources
3. Begin Phase 1 implementation
4. Iterate based on user feedback

---

*Document Version: 1.0*
*Last Updated: 2024-01-15*
*Author: Architecture Team*
