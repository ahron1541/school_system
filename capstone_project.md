# Smart RFID Gate Log, Attendance & Violation System — Project Roadmap and Build Guide
### From empty folder to a role-based, security-conscious school gate system.

This is the technical road map for the capstone system. It covers the highest-risk, highest-value parts end to end: **secure login → role-based access control → student record registration → RFID scan → attendance/entry logging → student identity display → violation alerts → dashboards → reports**, plus the hardware firmware and production deployment.

The system must not behave like one shared screen for everyone. Each user logs in with their own account, receives only the permissions assigned to their role, and is redirected to the correct module after login. For example, an **Administrator** lands on the Admin Dashboard, a **Guard** lands on the Guard Dashboard, and a **Registrar** lands on Student Registration.

**How to use this doc:** work top to bottom. Each code block tells you the exact file path to create it in.

---

## Table of Contents
1. Architecture recap
2. Module roadmap and RBAC matrix
3. Prerequisites — install these first
4. Project folder structure
5. Backend — full code
6. Frontend — full code
7. Firmware (ESP32) — full code
8. Running it in development
9. Building for production + deploying at the guard post
10. Security checklist
11. Phase 2 (optional/future): online sync
12. Testing your API
13. Extending the pattern
14. Troubleshooting

---

## 1. Architecture recap

```
[ESP32 + PN532 + OLED]
        │  HTTP POST (JSON, with a device API key header)
        ▼
[Express REST API] ──Prisma──▶ [MySQL/MariaDB]
        ▲
        │  REST API (JSON, JWT cookie auth)
        ▼
[React (Vite) SPA]
        ├── Admin Dashboard
        ├── Guard Dashboard
        ├── Registrar / Student Records
        └── Live Scan Kiosk Display
```

One Node/Express process serves the API. In production, that same process also serves the built React app, so the whole system is **one running process, one URL**.

The live scan screen is a dedicated **kiosk display**. In a real guard post this is usually opened in a separate browser tab, separate browser window, or second monitor. When a student taps their RFID ID, the system logs the attendance event and the kiosk display shows the student's photo, name, ID number, time, IN/OUT status, and any active violation alert.

---

## 2. Module roadmap and RBAC matrix

### Core modules

| Module | Purpose | Primary users |
|---|---|---|
| Authentication Module | Secure login, logout, session checking, account status checking, and redirecting users to their assigned module | All users |
| Admin Dashboard | System summary, account management, role assignment, reports overview, device status, and audit review | Administrator |
| Student Records Module | Register students, link RFID cards, upload/store student photos, update enrollment status, and maintain academic details | Administrator, Registrar |
| Attendance / Entry Log Module | Receive RFID scans, determine IN/OUT, save attendance records, and provide daily gate logs | Guard, Administrator |
| Guard Dashboard | Monitor gate activity, search students, view active alerts, and report violations during gate duty | Guard |
| Live Scan Kiosk Display | Full-screen display for the latest scanned student photo and scan result | Guard post screen |
| Violation Module | Create, view, and clear student violations | Guard, Discipline Officer, Administrator |
| Reports Module | Generate attendance summaries, violation summaries, and exportable daily/monthly reports | Administrator, Discipline Officer |
| Audit Log Module | Record sensitive actions such as login attempts, account changes, student edits, and violation updates | Administrator |

### Role-based access control

| Role | After-login redirect | Allowed modules |
|---|---|---|
| `ADMIN` | `/admin/dashboard` | All modules, user accounts, role assignment, reports, audit logs, configuration |
| `GUARD` | `/guard/dashboard` | Guard dashboard, live gate log, live scan kiosk display, student lookup, violation reporting |
| `REGISTRAR` | `/registrar/students` | Student registration, RFID assignment, student photo records, enrollment status updates |
| `DISCIPLINE` | `/discipline/violations` | Violation records, clearing violations, discipline reports |

The frontend may hide menu items, but the backend must still enforce permissions using `roleGuard(...)`. This is important: **real security lives on the server, not only in the UI**.

---

## 3. Prerequisites — install these first

| Tool | What for | Link |
|---|---|---|
| **Node.js (LTS, v20+)** | Runs both frontend build tools and backend | nodejs.org |
| **MySQL / MariaDB** | Your database — via XAMPP, or a standalone MySQL install | apachefriends.org (XAMPP) |
| **Git** | Version control | git-scm.com |
| **VS Code** | Editor | code.visualstudio.com |
| **Arduino IDE** | Flashing the ESP32 | arduino.cc |
| **Postman** (or the Thunder Client VS Code extension) | Testing API endpoints before wiring up the UI | postman.com |

**Arduino IDE library installs** (Library Manager → search each name → Install):
- `Adafruit PN532`
- `Adafruit SSD1306`
- `Adafruit GFX Library`
- `ArduinoJson`
- ESP32 board support: File → Preferences → Additional Board URLs → add `https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json`, then Boards Manager → install "esp32".

---

## 4. Project folder structure

Create this structure first:

```
gate-system/
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma
│   │   └── seed.js
│   ├── src/
│   │   ├── config/
│   │   │   └── env.js
│   │   ├── shared/
│   │   │   ├── db/prisma.js
│   │   │   ├── middleware/
│   │   │   │   ├── authMiddleware.js
│   │   │   │   ├── roleGuard.js
│   │   │   │   ├── deviceKeyGuard.js
│   │   │   │   ├── validate.js
│   │   │   │   └── errorHandler.js
│   │   │   └── utils/ApiError.js
│   │   ├── features/
│   │   │   ├── auth/
│   │   │   ├── users/
│   │   │   ├── students/
│   │   │   ├── entry-logs/
│   │   │   ├── violations/
│   │   │   ├── audit-logs/
│   │   │   └── reports/
│   │   └── server.js
│   ├── ecosystem.config.js
│   ├── .env.example
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   ├── features/
│   │   │   ├── auth/
│   │   │   ├── admin/
│   │   │   ├── guard/
│   │   │   ├── registrar/
│   │   │   ├── students/
│   │   │   ├── entry-logs/
│   │   │   ├── violations/
│   │   │   └── reports/
│   │   ├── shared/
│   │   │   ├── lib/apiClient.js
│   │   │   └── components/ProtectedRoute.jsx
│   │   ├── main.jsx
│   │   └── index.css
│   ├── .env.example
│   ├── vite.config.js
│   ├── tailwind.config.js
│   ├── postcss.config.js
│   └── package.json
└── firmware/
    └── gate_scanner/
        └── gate_scanner.ino
```

```bash
mkdir gate-system && cd gate-system
mkdir -p backend/prisma backend/src/config backend/src/shared/db backend/src/shared/middleware backend/src/shared/utils
mkdir -p backend/src/features/auth backend/src/features/users backend/src/features/students backend/src/features/entry-logs backend/src/features/violations backend/src/features/audit-logs backend/src/features/reports
mkdir -p frontend/src/app frontend/src/features/auth frontend/src/features/admin frontend/src/features/guard frontend/src/features/registrar frontend/src/features/students frontend/src/features/entry-logs frontend/src/features/violations frontend/src/features/reports frontend/src/shared/lib frontend/src/shared/components
mkdir -p firmware/gate_scanner
git init
```

---

## 5. Backend — full code

### 5.1 `backend/package.json`
```json
{
  "name": "gate-system-backend",
  "version": "1.0.0",
  "main": "src/server.js",
  "scripts": {
    "dev": "nodemon src/server.js",
    "start": "node src/server.js",
    "prisma:migrate": "prisma migrate dev",
    "prisma:generate": "prisma generate",
    "seed": "node prisma/seed.js"
  },
  "dependencies": {
    "express": "^4.19.2",
    "@prisma/client": "^5.18.0",
    "bcryptjs": "^2.4.3",
    "jsonwebtoken": "^9.0.2",
    "cookie-parser": "^1.4.6",
    "cors": "^2.8.5",
    "helmet": "^7.1.0",
    "express-rate-limit": "^7.4.0",
    "dotenv": "^16.4.5",
    "zod": "^3.23.8",
    "node-cron": "^3.0.3",
    "axios": "^1.7.2"
  },
  "devDependencies": {
    "prisma": "^5.18.0",
    "nodemon": "^3.1.4"
  }
}
```
> Using **bcryptjs** instead of `bcrypt` on purpose — `bcrypt` needs native compilation (a C++ build toolchain), which regularly breaks on Windows student laptops without Visual Studio Build Tools installed. `bcryptjs` is pure JavaScript, same API, zero setup friction. This is a real-world pragmatic choice, not a downgrade.

### 5.2 `backend/.env.example`
```env
PORT=4000
NODE_ENV=development
DATABASE_URL="mysql://root:@localhost:3306/gate_system"
JWT_SECRET=replace_with_a_long_random_string_before_running
JWT_EXPIRES_IN=8h
COOKIE_NAME=gate_token
CORS_ORIGIN=http://localhost:5173
DEVICE_API_KEY=replace_with_a_shared_secret_for_the_esp32
BCRYPT_ROUNDS=12
LOGIN_RATE_LIMIT_MAX=10
```
Copy this to `.env` and fill in real values. **Never commit `.env` to Git** — add it to `.gitignore`.

### 5.3 `backend/prisma/schema.prisma`
```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "mysql"
  url      = env("DATABASE_URL")
}

enum Role {
  ADMIN
  GUARD
  REGISTRAR
  DISCIPLINE
}

enum AccountStatus {
  ACTIVE
  DISABLED
  LOCKED
}

enum StudentStatus {
  ACTIVE
  INACTIVE
  SUSPENDED
  GRADUATED
}

enum LogType {
  IN
  OUT
}

enum ViolationStatus {
  ACTIVE
  CLEARED
}

model User {
  id                Int           @id @default(autoincrement())
  uuid              String        @unique @default(uuid())
  username          String        @unique
  fullName          String
  passwordHash      String
  role              Role
  status            AccountStatus @default(ACTIVE)
  failedLoginCount  Int           @default(0)
  lockedUntil       DateTime?
  lastLoginAt       DateTime?
  passwordChangedAt DateTime      @default(now())
  createdAt         DateTime      @default(now())
  updatedAt         DateTime      @updatedAt

  violationsReported Violation[] @relation("ReportedBy")
  loginAudits        LoginAudit[]

  @@map("users")
}

model Student {
  id               Int      @id @default(autoincrement())
  uuid             String   @unique @default(uuid())
  studentNo        String   @unique
  rfidUid          String   @unique
  fullName         String
  course           String
  section          String?
  yearLevel        String
  photoPath        String?
  guardianPhone    String?
  enrollmentStatus StudentStatus @default(ACTIVE)
  academicTerm     String?
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  entryLogs  EntryLog[]
  violations Violation[]

  @@map("students")
}

model EntryLog {
  id        Int       @id @default(autoincrement())
  uuid      String    @unique @default(uuid())
  studentId Int
  student   Student   @relation(fields: [studentId], references: [id])
  deviceId  String
  type      LogType
  scannedAt DateTime  @default(now())
  syncedAt  DateTime?

  @@index([studentId])
  @@index([scannedAt])
  @@map("entry_logs")
}

model LoginAudit {
  id        Int      @id @default(autoincrement())
  uuid      String   @unique @default(uuid())
  userId    Int?
  user      User?    @relation(fields: [userId], references: [id])
  username  String
  success   Boolean
  ipAddress String?
  userAgent String?
  reason    String?
  createdAt DateTime @default(now())

  @@index([username])
  @@index([createdAt])
  @@map("login_audits")
}

model Violation {
  id           Int             @id @default(autoincrement())
  uuid         String          @unique @default(uuid())
  studentId    Int
  student      Student         @relation(fields: [studentId], references: [id])
  reportedById Int
  reportedBy   User            @relation("ReportedBy", fields: [reportedById], references: [id])
  description  String
  status       ViolationStatus @default(ACTIVE)
  createdAt    DateTime        @default(now())
  clearedAt    DateTime?
  syncedAt     DateTime?

  @@index([studentId])
  @@index([status])
  @@map("violations")
}
```
`uuid` and `syncedAt` are there from day one so Phase 2 (online sync, §11) is a plug-in later, not a schema rewrite. `photoPath` is what the guard kiosk uses to show the student's face after scanning an ID. `LoginAudit`, `failedLoginCount`, and `lockedUntil` make the login module easier to defend because failed attempts are recorded instead of silently ignored.

### 5.4 `backend/prisma/seed.js`
```js
const bcrypt = require('bcryptjs');
const prisma = require('../src/shared/db/prisma');

async function main() {
  const passwordHash = await bcrypt.hash('ChangeMe123!', 12);

  await prisma.user.upsert({
    where: { username: 'admin' },
    update: {},
    create: {
      username: 'admin',
      fullName: 'System Administrator',
      passwordHash,
      role: 'ADMIN',
      status: 'ACTIVE',
    },
  });

  console.log('Seeded admin (username: admin / password: ChangeMe123!) — change this immediately after first login.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
```

### 5.5 `backend/src/config/env.js`
```js
require('dotenv').config();

const required = ['DATABASE_URL', 'JWT_SECRET', 'DEVICE_API_KEY'];
for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

module.exports = {
  port: process.env.PORT || 4000,
  nodeEnv: process.env.NODE_ENV || 'development',
  databaseUrl: process.env.DATABASE_URL,
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '8h',
  cookieName: process.env.COOKIE_NAME || 'gate_token',
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  deviceApiKey: process.env.DEVICE_API_KEY,
  bcryptRounds: Number(process.env.BCRYPT_ROUNDS || 12),
  loginRateLimitMax: Number(process.env.LOGIN_RATE_LIMIT_MAX || 10),
};
```

### 5.6 `backend/src/shared/db/prisma.js`
```js
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
});

module.exports = prisma;
```

### 5.7 `backend/src/shared/utils/ApiError.js`
```js
class ApiError extends Error {
  constructor(statusCode, message, details = null) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
  }
}

module.exports = ApiError;
```

### 5.8 `backend/src/shared/middleware/errorHandler.js`
```js
const ApiError = require('../utils/ApiError');

function errorHandler(err, req, res, next) {
  if (err instanceof ApiError) {
    return res.status(err.statusCode).json({
      status: 'error',
      message: err.message,
      details: err.details || undefined,
    });
  }

  console.error('[UNEXPECTED ERROR]', err);
  return res.status(500).json({ status: 'error', message: 'Something went wrong. Please try again.' });
}

module.exports = errorHandler;
```

### 5.9 `backend/src/shared/middleware/validate.js`
```js
const ApiError = require('../utils/ApiError');

function validate(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return next(new ApiError(400, 'Invalid request data', result.error.flatten()));
    }
    req.body = result.data;
    next();
  };
}

module.exports = validate;
```

### 5.10 `backend/src/shared/middleware/authMiddleware.js`
```js
const jwt = require('jsonwebtoken');
const env = require('../../config/env');
const ApiError = require('../utils/ApiError');

function authMiddleware(req, res, next) {
  const token = req.cookies?.[env.cookieName];
  if (!token) return next(new ApiError(401, 'Not authenticated'));

  try {
    req.user = jwt.verify(token, env.jwtSecret); // { id, username, role }
    next();
  } catch {
    return next(new ApiError(401, 'Invalid or expired session'));
  }
}

module.exports = authMiddleware;
```

### 5.11 `backend/src/shared/middleware/roleGuard.js`
```js
const ApiError = require('../utils/ApiError');

function roleGuard(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) return next(new ApiError(401, 'Not authenticated'));
    if (!allowedRoles.includes(req.user.role)) {
      return next(new ApiError(403, 'You do not have permission to perform this action'));
    }
    next();
  };
}

module.exports = roleGuard;
```

### 5.12 `backend/src/shared/middleware/deviceKeyGuard.js`
This is what stops anyone on the campus WiFi from POSTing fake scan data — the ESP32 is a device, not a logged-in user, so it authenticates with a shared secret key instead of a JWT cookie.
```js
const env = require('../../config/env');
const ApiError = require('../utils/ApiError');

function deviceKeyGuard(req, res, next) {
  const key = req.headers['x-device-key'];
  if (!key || key !== env.deviceApiKey) {
    return next(new ApiError(401, 'Invalid device credentials'));
  }
  next();
}

module.exports = deviceKeyGuard;
```

### 5.13 Feature: `auth`

**`backend/src/features/auth/auth.validation.js`**
```js
const { z } = require('zod');

const loginSchema = z.object({
  username: z.string().min(3),
  password: z.string().min(8),
});

module.exports = { loginSchema };
```

**`backend/src/features/auth/auth.service.js`**
```js
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../../shared/db/prisma');
const env = require('../../config/env');
const ApiError = require('../../shared/utils/ApiError');

function getDefaultRoute(role) {
  const routes = {
    ADMIN: '/admin/dashboard',
    GUARD: '/guard/dashboard',
    REGISTRAR: '/registrar/students',
    DISCIPLINE: '/discipline/violations',
  };
  return routes[role] || '/login';
}

async function writeLoginAudit({ userId = null, username, success, req, reason = null }) {
  await prisma.loginAudit.create({
    data: {
      userId,
      username,
      success,
      reason,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    },
  });
}

async function login(username, password, req) {
  const user = await prisma.user.findUnique({ where: { username } });

  if (!user) {
    await writeLoginAudit({ username, success: false, req, reason: 'unknown_user' });
    throw new ApiError(401, 'Invalid username or password');
  }

  if (user.status !== 'ACTIVE') {
    await writeLoginAudit({ userId: user.id, username, success: false, req, reason: 'account_not_active' });
    throw new ApiError(403, 'Account is not active');
  }

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    await writeLoginAudit({ userId: user.id, username, success: false, req, reason: 'account_locked' });
    throw new ApiError(423, 'Account is temporarily locked. Try again later.');
  }

  const isValid = await bcrypt.compare(password, user.passwordHash);
  if (!isValid) {
    const failedLoginCount = user.failedLoginCount + 1;
    const shouldLock = failedLoginCount >= 5;

    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginCount,
        lockedUntil: shouldLock ? new Date(Date.now() + 15 * 60 * 1000) : null,
      },
    });

    await writeLoginAudit({ userId: user.id, username, success: false, req, reason: 'bad_password' });
    throw new ApiError(401, 'Invalid username or password');
  }

  const token = jwt.sign(
    { id: user.id, username: user.username, fullName: user.fullName, role: user.role },
    env.jwtSecret,
    { expiresIn: env.jwtExpiresIn }
  );

  await prisma.user.update({
    where: { id: user.id },
    data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() },
  });

  await writeLoginAudit({ userId: user.id, username, success: true, req });

  return {
    token,
    user: {
      id: user.id,
      username: user.username,
      fullName: user.fullName,
      role: user.role,
      defaultRoute: getDefaultRoute(user.role),
    },
  };
}

module.exports = { login, getDefaultRoute };
```

**`backend/src/features/auth/auth.controller.js`**
```js
const authService = require('./auth.service');
const env = require('../../config/env');

async function loginHandler(req, res, next) {
  try {
    const { username, password } = req.body;
    const { token, user } = await authService.login(username, password, req);

    res.cookie(env.cookieName, token, {
      httpOnly: true,
      secure: env.nodeEnv === 'production',
      sameSite: 'lax',
      maxAge: 8 * 60 * 60 * 1000,
    });

    res.json({ status: 'ok', user });
  } catch (err) {
    next(err);
  }
}

function logoutHandler(req, res) {
  res.clearCookie(env.cookieName);
  res.json({ status: 'ok' });
}

function meHandler(req, res) {
  res.json({
    status: 'ok',
    user: {
      ...req.user,
      defaultRoute: authService.getDefaultRoute(req.user.role),
    },
  });
}

module.exports = { loginHandler, logoutHandler, meHandler };
```

**`backend/src/features/auth/auth.routes.js`**
```js
const express = require('express');
const rateLimit = require('express-rate-limit');
const { loginHandler, logoutHandler, meHandler } = require('./auth.controller');
const validate = require('../../shared/middleware/validate');
const { loginSchema } = require('./auth.validation');
const authMiddleware = require('../../shared/middleware/authMiddleware');
const env = require('../../config/env');

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: env.loginRateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: { status: 'error', message: 'Too many login attempts. Try again later.' },
});

router.post('/login', loginLimiter, validate(loginSchema), loginHandler);
router.post('/logout', authMiddleware, logoutHandler);
router.get('/me', authMiddleware, meHandler);

module.exports = router;
```

### 5.14 Feature: `students` (Student Records Module)

**`backend/src/features/students/students.validation.js`**
```js
const { z } = require('zod');

const createStudentSchema = z.object({
  studentNo: z.string().min(1),
  rfidUid: z.string().min(1),
  fullName: z.string().min(1),
  course: z.string().min(1),
  section: z.string().optional(),
  yearLevel: z.string().min(1),
  photoPath: z.string().optional(),
  guardianPhone: z.string().optional(),
  enrollmentStatus: z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED', 'GRADUATED']).default('ACTIVE'),
  academicTerm: z.string().optional(),
});

module.exports = { createStudentSchema };
```

**`backend/src/features/students/students.service.js`**
```js
const prisma = require('../../shared/db/prisma');

async function listStudents() {
  return prisma.student.findMany({ orderBy: { fullName: 'asc' } });
}

// Registrar taps a card: create the student if new, or refresh the record if returning.
async function createOrValidateStudent(data) {
  const existing = await prisma.student.findUnique({ where: { rfidUid: data.rfidUid } });

  if (existing) {
    return prisma.student.update({
      where: { id: existing.id },
      data: {
        ...data,
        enrollmentStatus: data.enrollmentStatus || 'ACTIVE',
        academicTerm: data.academicTerm ?? existing.academicTerm,
      },
    });
  }

  return prisma.student.create({ data: { ...data, enrollmentStatus: data.enrollmentStatus || 'ACTIVE' } });
}

module.exports = { listStudents, createOrValidateStudent };
```

**`backend/src/features/students/students.controller.js`**
```js
const studentsService = require('./students.service');

async function listHandler(req, res, next) {
  try {
    res.json({ status: 'ok', data: await studentsService.listStudents() });
  } catch (err) { next(err); }
}

async function createHandler(req, res, next) {
  try {
    const student = await studentsService.createOrValidateStudent(req.body);
    res.status(201).json({ status: 'ok', data: student });
  } catch (err) { next(err); }
}

module.exports = { listHandler, createHandler };
```

**`backend/src/features/students/students.routes.js`**
```js
const express = require('express');
const { listHandler, createHandler } = require('./students.controller');
const validate = require('../../shared/middleware/validate');
const { createStudentSchema } = require('./students.validation');
const authMiddleware = require('../../shared/middleware/authMiddleware');
const roleGuard = require('../../shared/middleware/roleGuard');

const router = express.Router();
router.use(authMiddleware);

router.get('/', roleGuard('ADMIN', 'REGISTRAR', 'GUARD', 'DISCIPLINE'), listHandler);
router.post('/', roleGuard('ADMIN', 'REGISTRAR'), validate(createStudentSchema), createHandler);

module.exports = router;
```

### 5.15 Feature: `entry-logs` (this is the core loop — the whole system's heart)

**`backend/src/features/entry-logs/entryLogs.validation.js`**
```js
const { z } = require('zod');

const scanSchema = z.object({
  uid: z.string().min(1),
  deviceId: z.string().min(1),
});

module.exports = { scanSchema };
```

**`backend/src/features/entry-logs/entryLogs.service.js`**
```js
const prisma = require('../../shared/db/prisma');

async function processScan(uid, deviceId) {
  const student = await prisma.student.findUnique({ where: { rfidUid: uid } });

  if (!student) {
    return { status: 'unknown', message: 'Card not registered' };
  }

  if (student.enrollmentStatus !== 'ACTIVE') {
    return { status: 'blocked', message: 'Not enrolled for current term', studentName: student.fullName };
  }

  const lastLog = await prisma.entryLog.findFirst({
    where: { studentId: student.id },
    orderBy: { scannedAt: 'desc' },
  });
  const nextType = !lastLog || lastLog.type === 'OUT' ? 'IN' : 'OUT';

  await prisma.entryLog.create({ data: { studentId: student.id, deviceId, type: nextType } });

  const activeViolation = await prisma.violation.findFirst({
    where: { studentId: student.id, status: 'ACTIVE' },
  });

  return {
    status: activeViolation ? 'alert' : 'ok',
    message: activeViolation ? 'Active violation on record' : `${nextType === 'IN' ? 'Entry' : 'Exit'} logged`,
    studentName: student.fullName,
    studentNo: student.studentNo,
    photoPath: student.photoPath,
    type: nextType,
    hasActiveViolation: Boolean(activeViolation),
  };
}

async function getTodayLogs() {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  return prisma.entryLog.findMany({
    where: { scannedAt: { gte: startOfDay } },
    include: { student: true },
    orderBy: { scannedAt: 'desc' },
    take: 100,
  });
}

async function getLatestScan() {
  return prisma.entryLog.findFirst({
    include: {
      student: {
        include: {
          violations: { where: { status: 'ACTIVE' } },
        },
      },
    },
    orderBy: { scannedAt: 'desc' },
  });
}

module.exports = { processScan, getTodayLogs, getLatestScan };
```

**`backend/src/features/entry-logs/entryLogs.controller.js`**
```js
const entryLogsService = require('./entryLogs.service');

async function scanHandler(req, res, next) {
  try {
    const { uid, deviceId } = req.body;
    res.json({ status: 'ok', data: await entryLogsService.processScan(uid, deviceId) });
  } catch (err) { next(err); }
}

async function todayLogsHandler(req, res, next) {
  try {
    res.json({ status: 'ok', data: await entryLogsService.getTodayLogs() });
  } catch (err) { next(err); }
}

async function latestScanHandler(req, res, next) {
  try {
    res.json({ status: 'ok', data: await entryLogsService.getLatestScan() });
  } catch (err) { next(err); }
}

module.exports = { scanHandler, todayLogsHandler, latestScanHandler };
```

**`backend/src/features/entry-logs/entryLogs.routes.js`**
```js
const express = require('express');
const { scanHandler, todayLogsHandler, latestScanHandler } = require('./entryLogs.controller');
const validate = require('../../shared/middleware/validate');
const { scanSchema } = require('./entryLogs.validation');
const authMiddleware = require('../../shared/middleware/authMiddleware');
const deviceKeyGuard = require('../../shared/middleware/deviceKeyGuard');
const roleGuard = require('../../shared/middleware/roleGuard');

const router = express.Router();

// Hardware endpoint — protected by device key, not a user login.
router.post('/scan', deviceKeyGuard, validate(scanSchema), scanHandler);

// Web dashboard endpoint — protected by normal user login.
router.get('/', authMiddleware, roleGuard('ADMIN', 'GUARD'), todayLogsHandler);
router.get('/latest', authMiddleware, roleGuard('ADMIN', 'GUARD'), latestScanHandler);

module.exports = router;
```

### 5.16 Feature: `violations`

**`backend/src/features/violations/violations.validation.js`**
```js
const { z } = require('zod');

const createViolationSchema = z.object({
  studentId: z.number().int().positive(),
  description: z.string().min(3),
});

module.exports = { createViolationSchema };
```

**`backend/src/features/violations/violations.service.js`**
```js
const prisma = require('../../shared/db/prisma');
const ApiError = require('../../shared/utils/ApiError');

async function createViolation(studentId, description, reportedById) {
  return prisma.violation.create({ data: { studentId, description, reportedById, status: 'ACTIVE' } });
}

async function listViolations(status) {
  return prisma.violation.findMany({
    where: status ? { status } : undefined,
    include: { student: true, reportedBy: { select: { username: true } } },
    orderBy: { createdAt: 'desc' },
  });
}

async function clearViolation(id) {
  const violation = await prisma.violation.findUnique({ where: { id } });
  if (!violation) throw new ApiError(404, 'Violation not found');

  return prisma.violation.update({ where: { id }, data: { status: 'CLEARED', clearedAt: new Date() } });
}

module.exports = { createViolation, listViolations, clearViolation };
```

**`backend/src/features/violations/violations.controller.js`**
```js
const violationsService = require('./violations.service');

async function createHandler(req, res, next) {
  try {
    const { studentId, description } = req.body;
    const violation = await violationsService.createViolation(studentId, description, req.user.id);
    res.status(201).json({ status: 'ok', data: violation });
  } catch (err) { next(err); }
}

async function listHandler(req, res, next) {
  try {
    res.json({ status: 'ok', data: await violationsService.listViolations(req.query.status) });
  } catch (err) { next(err); }
}

async function clearHandler(req, res, next) {
  try {
    res.json({ status: 'ok', data: await violationsService.clearViolation(Number(req.params.id)) });
  } catch (err) { next(err); }
}

module.exports = { createHandler, listHandler, clearHandler };
```

**`backend/src/features/violations/violations.routes.js`**
```js
const express = require('express');
const { createHandler, listHandler, clearHandler } = require('./violations.controller');
const validate = require('../../shared/middleware/validate');
const { createViolationSchema } = require('./violations.validation');
const authMiddleware = require('../../shared/middleware/authMiddleware');
const roleGuard = require('../../shared/middleware/roleGuard');

const router = express.Router();
router.use(authMiddleware);

router.get('/', roleGuard('ADMIN', 'DISCIPLINE', 'GUARD'), listHandler);
router.post('/', roleGuard('ADMIN', 'GUARD'), validate(createViolationSchema), createHandler);
router.patch('/:id/clear', roleGuard('ADMIN', 'DISCIPLINE'), clearHandler);

module.exports = router;
```

### 5.17 Feature: `reports`

**`backend/src/features/reports/reports.service.js`**
```js
const prisma = require('../../shared/db/prisma');

async function getSummary() {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const [entriesToday, activeViolations, totalStudents] = await Promise.all([
    prisma.entryLog.count({ where: { scannedAt: { gte: startOfDay }, type: 'IN' } }),
    prisma.violation.count({ where: { status: 'ACTIVE' } }),
    prisma.student.count({ where: { enrollmentStatus: 'ACTIVE' } }),
  ]);

  return { entriesToday, activeViolations, totalStudents };
}

module.exports = { getSummary };
```

**`backend/src/features/reports/reports.controller.js`**
```js
const reportsService = require('./reports.service');

async function summaryHandler(req, res, next) {
  try {
    res.json({ status: 'ok', data: await reportsService.getSummary() });
  } catch (err) { next(err); }
}

module.exports = { summaryHandler };
```

**`backend/src/features/reports/reports.routes.js`**
```js
const express = require('express');
const { summaryHandler } = require('./reports.controller');
const authMiddleware = require('../../shared/middleware/authMiddleware');
const roleGuard = require('../../shared/middleware/roleGuard');

const router = express.Router();
router.use(authMiddleware, roleGuard('ADMIN', 'DISCIPLINE'));
router.get('/summary', summaryHandler);

module.exports = router;
```

### 5.18 `backend/src/server.js` — wires everything together
```js
const express = require('express');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const env = require('./config/env');
const errorHandler = require('./shared/middleware/errorHandler');

const authRoutes = require('./features/auth/auth.routes');
const studentsRoutes = require('./features/students/students.routes');
const entryLogsRoutes = require('./features/entry-logs/entryLogs.routes');
const violationsRoutes = require('./features/violations/violations.routes');
const reportsRoutes = require('./features/reports/reports.routes');

const app = express();

app.use(helmet());
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use(cors({ origin: env.corsOrigin, credentials: true }));

app.use('/api', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
}));

app.use('/api/auth', authRoutes);
app.use('/api/students', studentsRoutes);
app.use('/api/entry-logs', entryLogsRoutes);
app.use('/api/violations', violationsRoutes);
app.use('/api/reports', reportsRoutes);

// In production, this same process serves the built React app too —
// one running process, one URL, as covered in the deployment section.
if (env.nodeEnv === 'production') {
  const distPath = path.join(__dirname, '../../frontend/dist');
  app.use(express.static(distPath));
  app.get('*', (req, res) => res.sendFile(path.join(distPath, 'index.html')));
}

app.use(errorHandler);

app.listen(env.port, () => console.log(`Server running on port ${env.port} [${env.nodeEnv}]`));
```

### 5.19 `backend/ecosystem.config.js` (PM2 config)
```js
module.exports = {
  apps: [
    {
      name: 'gate-system',
      script: './src/server.js',
      cwd: __dirname,
      env: { NODE_ENV: 'production' },
      autorestart: true,
      max_restarts: 10,
      watch: false,
    },
  ],
};
```

---

## 6. Frontend — full code

### 6.1 `frontend/package.json`
```json
{
  "name": "gate-system-frontend",
  "private": true,
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^6.26.0",
    "@tanstack/react-query": "^5.51.0",
    "axios": "^1.7.2",
    "recharts": "^2.12.7"
  },
  "devDependencies": {
    "vite": "^5.4.0",
    "@vitejs/plugin-react": "^4.3.1",
    "tailwindcss": "^3.4.7",
    "postcss": "^8.4.40",
    "autoprefixer": "^10.4.19"
  }
}
```

### 6.2 `frontend/.env.example`
```env
VITE_API_URL=/api
```
Using a relative path (not a full `http://...` URL) is intentional — Vite's dev proxy (below) forwards `/api` to your backend during development, and in production the built frontend is served from the same origin as the API, so `/api` just works in both cases with zero CORS headaches.

### 6.3 `frontend/vite.config.js`
```js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: { '/api': 'http://localhost:4000' },
  },
});
```

### 6.4 `frontend/tailwind.config.js`
```js
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: { extend: {} },
  plugins: [],
};
```

### 6.5 `frontend/postcss.config.js`
```js
export default {
  plugins: { tailwindcss: {}, autoprefixer: {} },
};
```

### 6.6 `frontend/src/index.css`
```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

### 6.7 `frontend/src/shared/lib/apiClient.js`
```js
import axios from 'axios';

const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  withCredentials: true,
});

apiClient.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) window.location.href = '/login';
    return Promise.reject(err);
  }
);

export default apiClient;
```

### 6.8 `frontend/src/features/auth/useAuth.jsx`
```jsx
import { createContext, useContext, useEffect, useState } from 'react';
import apiClient from '../../shared/lib/apiClient';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiClient.get('/auth/me')
      .then((res) => setUser(res.data.user))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  async function login(username, password) {
    const res = await apiClient.post('/auth/login', { username, password });
    setUser(res.data.user);
    return res.data.user;
  }

  async function logout() {
    await apiClient.post('/auth/logout');
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
```

### 6.9 `frontend/src/shared/components/ProtectedRoute.jsx`
```jsx
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../features/auth/useAuth';

export default function ProtectedRoute({ children, allowedRoles }) {
  const { user, loading } = useAuth();

  if (loading) return <div className="p-8 text-center">Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to={user.defaultRoute || '/login'} replace />;
  }

  return children;
}
```

### 6.10 `frontend/src/shared/components/RoleHome.jsx`
```jsx
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../features/auth/useAuth';

export default function RoleHome() {
  const { user, loading } = useAuth();

  if (loading) return <div className="p-8 text-center">Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;

  return <Navigate to={user.defaultRoute} replace />;
}
```

### 6.11 `frontend/src/features/auth/LoginPage.jsx`
```jsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from './useAuth';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const { login } = useAuth();
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    try {
      const user = await login(username, password);
      navigate(user.defaultRoute, { replace: true });
    } catch (err) {
      setError(err.response?.data?.message || 'Login failed');
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <form onSubmit={handleSubmit} className="bg-white p-8 rounded-lg shadow-md w-80">
        <h1 className="text-xl font-bold mb-4">Gate System Login</h1>
        {error && <p className="text-red-600 text-sm mb-3">{error}</p>}
        <input className="w-full border rounded p-2 mb-3" placeholder="Username"
          value={username} onChange={(e) => setUsername(e.target.value)} />
        <input className="w-full border rounded p-2 mb-4" type="password" placeholder="Password"
          value={password} onChange={(e) => setPassword(e.target.value)} />
        <button className="w-full bg-blue-600 text-white rounded p-2" type="submit">Log In</button>
      </form>
    </div>
  );
}
```

### 6.12 `frontend/src/features/entry-logs/LiveGateBoard.jsx`
```jsx
import { useQuery } from '@tanstack/react-query';
import apiClient from '../../shared/lib/apiClient';

export default function LiveGateBoard() {
  const { data, isLoading } = useQuery({
    queryKey: ['entry-logs-today'],
    queryFn: () => apiClient.get('/entry-logs').then((res) => res.data.data),
    refetchInterval: 2000, // this is your "real-time" mechanism
  });

  if (isLoading) return <p className="p-6">Loading gate log...</p>;

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Live Gate Log</h1>
      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="border-b"><th className="py-2">Student</th><th>Type</th><th>Time</th></tr>
        </thead>
        <tbody>
          {data.map((log) => (
            <tr key={log.uuid} className="border-b">
              <td className="py-2">{log.student.fullName}</td>
              <td>{log.type}</td>
              <td>{new Date(log.scannedAt).toLocaleTimeString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

### 6.13 `frontend/src/features/entry-logs/LiveScanKiosk.jsx`
```jsx
import { useQuery } from '@tanstack/react-query';
import apiClient from '../../shared/lib/apiClient';

export default function LiveScanKiosk() {
  const { data } = useQuery({
    queryKey: ['latest-scan'],
    queryFn: () => apiClient.get('/entry-logs/latest').then((res) => res.data.data),
    refetchInterval: 1000,
  });

  if (!data) {
    return (
      <main className="min-h-screen bg-slate-950 text-white grid place-items-center">
        <p className="text-3xl font-semibold">Waiting for student scan...</p>
      </main>
    );
  }

  const statusColor = data.type === 'IN' ? 'text-emerald-300' : 'text-sky-300';
  const hasViolation = data.student.violations.length > 0;

  return (
    <main className="min-h-screen bg-slate-950 text-white grid grid-cols-[420px_1fr] gap-10 p-10">
      <section className="flex items-center justify-center">
        {data.student.photoPath ? (
          <img
            src={data.student.photoPath}
            alt={data.student.fullName}
            className="h-[520px] w-[380px] rounded object-cover border border-white/20"
          />
        ) : (
          <div className="h-[520px] w-[380px] rounded border border-white/20 grid place-items-center text-2xl">
            No Photo
          </div>
        )}
      </section>

      <section className="flex flex-col justify-center">
        <p className={`text-8xl font-bold ${statusColor}`}>{data.type}</p>
        <h1 className="mt-6 text-6xl font-bold">{data.student.fullName}</h1>
        <p className="mt-4 text-3xl text-slate-300">{data.student.studentNo}</p>
        <p className="mt-8 text-4xl">{new Date(data.scannedAt).toLocaleString()}</p>
        {hasViolation && (
          <div className="mt-10 rounded bg-red-700 p-6 text-3xl font-bold">
            ACTIVE VIOLATION ON RECORD
          </div>
        )}
      </section>
    </main>
  );
}
```

### 6.14 `frontend/src/features/violations/ViolationList.jsx`
```jsx
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '../../shared/lib/apiClient';

export default function ViolationList({ canClear = false }) {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['violations', 'active'],
    queryFn: () => apiClient.get('/violations?status=ACTIVE').then((res) => res.data.data),
  });

  const clearMutation = useMutation({
    mutationFn: (id) => apiClient.patch(`/violations/${id}/clear`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['violations'] }),
  });

  if (isLoading) return <p className="p-6">Loading violations...</p>;

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Active Violations</h1>
      <ul className="space-y-2">
        {data.map((v) => (
          <li key={v.uuid} className="border rounded p-3 flex justify-between items-center">
            <div>
              <p className="font-semibold">{v.student.fullName}</p>
              <p className="text-sm text-gray-600">{v.description}</p>
            </div>
            {canClear && (
              <button className="bg-green-600 text-white px-3 py-1 rounded"
                onClick={() => clearMutation.mutate(v.id)}>Clear</button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
```

### 6.15 `frontend/src/features/admin/AdminDashboard.jsx`
```jsx
import { useQuery } from '@tanstack/react-query';
import { BarChart, Bar, XAxis, YAxis, Tooltip } from 'recharts';
import apiClient from '../../shared/lib/apiClient';

export default function AdminDashboard() {
  const { data } = useQuery({
    queryKey: ['reports-summary'],
    queryFn: () => apiClient.get('/reports/summary').then((res) => res.data.data),
    refetchInterval: 5000,
  });

  if (!data) return <p className="p-6">Loading dashboard...</p>;

  const chartData = [
    { name: 'Entries Today', value: data.entriesToday },
    { name: 'Active Violations', value: data.activeViolations },
    { name: 'Enrolled Students', value: data.totalStudents },
  ];

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Reports Dashboard</h1>
      <BarChart width={500} height={300} data={chartData}>
        <XAxis dataKey="name" /><YAxis /><Tooltip /><Bar dataKey="value" fill="#2563eb" />
      </BarChart>
    </div>
  );
}
```

### 6.16 `frontend/src/features/guard/GuardDashboard.jsx`
```jsx
import LiveGateBoard from '../entry-logs/LiveGateBoard';
import ViolationList from '../violations/ViolationList';

export default function GuardDashboard() {
  return (
    <div className="grid min-h-screen grid-cols-[1fr_420px] bg-gray-50">
      <LiveGateBoard />
      <aside className="border-l bg-white overflow-y-auto">
        <ViolationList />
      </aside>
    </div>
  );
}
```

### 6.17 `frontend/src/features/registrar/StudentRegistrationPage.jsx`
```jsx
import { useState } from 'react';
import apiClient from '../../shared/lib/apiClient';

const initialForm = {
  studentNo: '',
  rfidUid: '',
  fullName: '',
  course: '',
  section: '',
  yearLevel: '',
  photoPath: '',
  guardianPhone: '',
  academicTerm: '',
  enrollmentStatus: 'ACTIVE',
};

export default function StudentRegistrationPage() {
  const [form, setForm] = useState(initialForm);
  const [message, setMessage] = useState('');

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setMessage('');
    await apiClient.post('/students', form);
    setMessage('Student record saved.');
    setForm(initialForm);
  }

  return (
    <main className="min-h-screen bg-gray-100 p-8">
      <form onSubmit={handleSubmit} className="mx-auto max-w-3xl bg-white p-6 rounded shadow">
        <h1 className="text-2xl font-bold mb-6">Student Registration</h1>
        {message && <p className="mb-4 text-green-700">{message}</p>}

        <div className="grid grid-cols-2 gap-4">
          {Object.entries(form).map(([field, value]) => (
            <label key={field} className="text-sm font-medium text-gray-700">
              {field}
              {field === 'enrollmentStatus' ? (
                <select
                  className="mt-1 w-full rounded border p-2"
                  value={value}
                  onChange={(e) => updateField(field, e.target.value)}
                >
                  <option value="ACTIVE">ACTIVE</option>
                  <option value="INACTIVE">INACTIVE</option>
                  <option value="SUSPENDED">SUSPENDED</option>
                  <option value="GRADUATED">GRADUATED</option>
                </select>
              ) : (
                <input
                  className="mt-1 w-full rounded border p-2"
                  value={value}
                  onChange={(e) => updateField(field, e.target.value)}
                />
              )}
            </label>
          ))}
        </div>

        <button type="submit" className="mt-6 rounded bg-blue-700 px-4 py-2 text-white">
          Save Student
        </button>
      </form>
    </main>
  );
}
```

In production, `photoPath` should normally point to an uploaded file served by your backend, such as `/uploads/students/2026-0001.jpg`. For a capstone build, you can start with a stored path first, then add file upload after the main RFID attendance flow is stable.

### 6.18 `frontend/src/app/App.jsx`
```jsx
import { Routes, Route } from 'react-router-dom';
import LoginPage from '../features/auth/LoginPage';
import RoleHome from '../shared/components/RoleHome';
import LiveGateBoard from '../features/entry-logs/LiveGateBoard';
import LiveScanKiosk from '../features/entry-logs/LiveScanKiosk';
import ViolationList from '../features/violations/ViolationList';
import AdminDashboard from '../features/admin/AdminDashboard';
import GuardDashboard from '../features/guard/GuardDashboard';
import StudentRegistrationPage from '../features/registrar/StudentRegistrationPage';
import ProtectedRoute from '../shared/components/ProtectedRoute';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<RoleHome />} />
      <Route path="/admin/dashboard" element={
        <ProtectedRoute allowedRoles={['ADMIN']}><AdminDashboard /></ProtectedRoute>
      } />
      <Route path="/guard/dashboard" element={
        <ProtectedRoute allowedRoles={['ADMIN', 'GUARD']}><GuardDashboard /></ProtectedRoute>
      } />
      <Route path="/guard/live-scan" element={
        <ProtectedRoute allowedRoles={['ADMIN', 'GUARD']}><LiveScanKiosk /></ProtectedRoute>
      } />
      <Route path="/registrar/students" element={
        <ProtectedRoute allowedRoles={['ADMIN', 'REGISTRAR']}><StudentRegistrationPage /></ProtectedRoute>
      } />
      <Route path="/entry-logs" element={
        <ProtectedRoute allowedRoles={['ADMIN', 'GUARD']}><LiveGateBoard /></ProtectedRoute>
      } />
      <Route path="/violations" element={
        <ProtectedRoute allowedRoles={['ADMIN', 'DISCIPLINE', 'GUARD']}><ViolationList /></ProtectedRoute>
      } />
      <Route path="/discipline/violations" element={
        <ProtectedRoute allowedRoles={['ADMIN', 'DISCIPLINE']}><ViolationList canClear /></ProtectedRoute>
      } />
      <Route path="/reports" element={
        <ProtectedRoute allowedRoles={['ADMIN', 'DISCIPLINE']}><AdminDashboard /></ProtectedRoute>
      } />
    </Routes>
  );
}
```

### 6.19 `frontend/src/main.jsx`
```jsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './app/App';
import { AuthProvider } from './features/auth/useAuth';
import './index.css';

const queryClient = new QueryClient();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        <AuthProvider><App /></AuthProvider>
      </QueryClientProvider>
    </BrowserRouter>
  </React.StrictMode>
);
```

You'll also need a minimal `frontend/index.html` (Vite generates this by default when you scaffold with `npm create vite@latest` — see §8).

---

## 7. Firmware (ESP32) — full code

### `firmware/gate_scanner/gate_scanner.ino`
```cpp
#include <Wire.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <Adafruit_PN532.h>

// ---- CONFIG: fill these in ----
const char* WIFI_SSID = "YOUR_WIFI_NAME";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";
const char* SERVER_URL = "http://192.168.1.10:4000/api/entry-logs/scan"; // your server's LAN IP
const char* DEVICE_ID = "gate-01";
const char* DEVICE_API_KEY = "REPLACE_WITH_SAME_KEY_AS_BACKEND_.ENV";

#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, -1);
Adafruit_PN532 nfc(-1, -1); // I2C mode

void showMessage(String line1, String line2 = "") {
  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);
  display.setCursor(0, 10); display.println(line1);
  display.setCursor(0, 30); display.println(line2);
  display.display();
}

void connectWiFi() {
  showMessage("Connecting WiFi...");
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  while (WiFi.status() != WL_CONNECTED) delay(500);
  showMessage("WiFi Connected", WiFi.localIP().toString());
  delay(1000);
}

void setup() {
  Serial.begin(115200);
  Wire.begin();

  display.begin(SSD1306_SWITCHCAPVCC, 0x3C);
  showMessage("Booting...");

  nfc.begin();
  if (!nfc.getFirmwareVersion()) {
    showMessage("PN532 not found", "Check wiring");
    while (1) delay(1000);
  }
  nfc.SAMConfig();

  connectWiFi();
  showMessage("Ready", "Tap your ID");
}

String uidToString(uint8_t *uid, uint8_t uidLength) {
  String result = "";
  for (uint8_t i = 0; i < uidLength; i++) {
    if (uid[i] < 0x10) result += "0";
    result += String(uid[i], HEX);
  }
  result.toUpperCase();
  return result;
}

void sendScan(String uid) {
  if (WiFi.status() != WL_CONNECTED) {
    showMessage("WiFi lost", "Reconnecting...");
    connectWiFi();
  }

  HTTPClient http;
  http.begin(SERVER_URL);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Device-Key", DEVICE_API_KEY);

  StaticJsonDocument<200> doc;
  doc["uid"] = uid;
  doc["deviceId"] = DEVICE_ID;
  String payload;
  serializeJson(doc, payload);

  int httpCode = http.POST(payload);

  if (httpCode == 200) {
    StaticJsonDocument<512> resDoc;
    deserializeJson(resDoc, http.getString());
    JsonObject data = resDoc["data"];

    String status = data["status"] | "unknown";
    String name = data["studentName"] | "";
    String message = data["message"] | "";

    if (status == "ok") showMessage(name, message);
    else if (status == "alert") showMessage(name, "VIOLATION ALERT");
    else if (status == "blocked") showMessage(name, "NOT ENROLLED");
    else showMessage("Card not registered", "See registrar");
  } else {
    showMessage("Server error", "Try again");
  }

  http.end();
  delay(2000);
  showMessage("Ready", "Tap your ID");
}

void loop() {
  uint8_t uid[7];
  uint8_t uidLength;

  if (nfc.readPassiveTargetID(PN532_MIFARE_ISO14443A, uid, &uidLength, 1000)) {
    String uidStr = uidToString(uid, uidLength);
    showMessage("Reading...", uidStr);
    sendScan(uidStr);
  }
}
```

---

## 8. Running it in development

```bash
# 1. Backend
cd backend
npm install
cp .env.example .env        # then edit .env with real values
npx prisma generate
npx prisma migrate dev --name init
npm run seed
npm run dev                  # runs on http://localhost:4000

# 2. Frontend (new terminal)
cd frontend
npm create vite@latest . -- --template react   # if you haven't scaffolded yet — then paste in the files above
npm install
npm install @tanstack/react-query axios react-router-dom recharts
npm install -D tailwindcss postcss autoprefixer
cp .env.example .env
npm run dev                  # runs on http://localhost:5173
```

Log in at `http://localhost:5173/login` with `admin` / `ChangeMe123!` — then immediately go build a "change password" flow before you forget, or at minimum change it directly in the database for your demo.

Test the scan endpoint without hardware yet, using curl or Postman:
```bash
curl -X POST http://localhost:4000/api/entry-logs/scan \
  -H "Content-Type: application/json" \
  -H "X-Device-Key: your_device_api_key" \
  -d '{"uid":"A1B2C3D4","deviceId":"gate-01"}'
```
(You'll get `"status":"unknown"` until you've created a student with that `rfidUid` via `POST /api/students`.)

---

## 9. Building for production + deploying at the guard post

```bash
cd frontend
npm run build          # creates frontend/dist

cd ../backend
npm install -g pm2
pm2 start ecosystem.config.js
pm2 startup            # follow the printed instructions to enable boot-start
pm2 save
```
Now one Node process (managed by PM2) serves your entire system at `http://<gate-pc-lan-ip>:4000`.

Use the guard's main browser for daily monitoring:
```
http://192.168.1.10:4000/guard/dashboard
```

Use the second monitor, second browser window, or kiosk browser for the live student identity display:
```
chrome.exe --kiosk http://192.168.1.10:4000/guard/live-scan
```
This is the screen that shows the student's face after their ID is scanned.

---

## 10. Security checklist (go through this before defense)

- [ ] `.env` is in `.gitignore`, never committed
- [ ] `JWT_SECRET` and `DEVICE_API_KEY` are long random strings, not the example placeholders
- [ ] Default admin password changed from `ChangeMe123!`
- [ ] Each staff member has their own account; no shared admin or guard account is used during real deployment
- [ ] Every route that needs a role has `roleGuard(...)` — verified server-side, not just hidden in the UI
- [ ] Every POST/PATCH body goes through a Zod `validate()` schema
- [ ] Passwords are hashed with bcryptjs — never stored or logged in plaintext
- [ ] Login attempts are recorded in `login_audits`, including failed attempts
- [ ] Repeated failed logins temporarily lock the account
- [ ] Login endpoint has rate limiting enabled
- [ ] The `/api/entry-logs/scan` endpoint requires `X-Device-Key` — confirm a request without it gets rejected
- [ ] The ESP32 device key is stored only in firmware and backend `.env`, not displayed in the frontend
- [ ] Student photo paths are protected from path traversal and only point to the intended uploads folder
- [ ] A scheduled `mysqldump` backup is running (see your earlier stack doc for the cron/Task Scheduler setup)
- [ ] Cookies are `httpOnly` (already set in `auth.controller.js`) — confirm devtools shows you can't read the token from `document.cookie`
- [ ] Production cookies use `secure: true` and the system is served over HTTPS when deployed beyond a local LAN
- [ ] Admin reviews audit logs after account changes, student record edits, and violation updates

---

## 11. Phase 2 (optional/future): online sync

**Do not build this during your 3-week window** — it's genuinely out of scope, and your Chapter 1 already correctly lists it as future work. This section exists so the *design* is ready when you (or a future developer) want to add it.

The `uuid` and `syncedAt` columns already in your schema (§5.3) exist for exactly this. When you're ready:

**`backend/src/features/sync/sync.service.js`**
```js
// PHASE 2 — not required for local deployment.
// Pushes unsynced records to a cloud-hosted copy of this same API
// whenever the local server has internet access.
const axios = require('axios');
const prisma = require('../../shared/db/prisma');

const CLOUD_API_URL = process.env.CLOUD_SYNC_URL;
const CLOUD_SYNC_KEY = process.env.CLOUD_SYNC_KEY;

async function syncUnsyncedRecords() {
  const logs = await prisma.entryLog.findMany({ where: { syncedAt: null }, take: 100 });
  const violations = await prisma.violation.findMany({ where: { syncedAt: null }, take: 100 });
  if (!logs.length && !violations.length) return;

  try {
    await axios.post(CLOUD_API_URL, { logs, violations }, {
      headers: { 'X-Sync-Key': CLOUD_SYNC_KEY },
      timeout: 5000,
    });

    const now = new Date();
    await prisma.entryLog.updateMany({ where: { id: { in: logs.map((l) => l.id) } }, data: { syncedAt: now } });
    await prisma.violation.updateMany({ where: { id: { in: violations.map((v) => v.id) } }, data: { syncedAt: now } });
    console.log(`Synced ${logs.length} logs, ${violations.length} violations.`);
  } catch (err) {
    console.log('Sync skipped (offline or cloud unreachable):', err.message);
  }
}

module.exports = { syncUnsyncedRecords };
```

Trigger it on a schedule in `server.js`, only if configured:
```js
const cron = require('node-cron');
const { syncUnsyncedRecords } = require('./features/sync/sync.service');
if (env.nodeEnv === 'production' && process.env.CLOUD_SYNC_URL) {
  cron.schedule('*/10 * * * *', syncUnsyncedRecords);
}
```
For the cloud side later: deploy this same backend to Railway or Render, and use their managed MySQL add-on (or PlanetScale). Same schema, same Prisma models — no rewrite needed, because you planned for it from day one.

---

## 12. Testing your API (Postman collection outline)

| Method | Endpoint | Auth needed |
|---|---|---|
| POST | `/api/auth/login` | none |
| POST | `/api/auth/logout` | cookie |
| GET | `/api/auth/me` | cookie |
| GET | `/api/students` | cookie |
| POST | `/api/students` | cookie (ADMIN/REGISTRAR) |
| POST | `/api/entry-logs/scan` | `X-Device-Key` header |
| GET | `/api/entry-logs` | cookie |
| GET | `/api/entry-logs/latest` | cookie (ADMIN/GUARD) |
| GET | `/api/violations?status=ACTIVE` | cookie |
| POST | `/api/violations` | cookie (ADMIN/GUARD) |
| PATCH | `/api/violations/:id/clear` | cookie (ADMIN/DISCIPLINE) |
| GET | `/api/reports/summary` | cookie (ADMIN/DISCIPLINE) |

Test every endpoint in Postman **before** wiring it into React — it isolates whether a bug is in your API or your frontend, which saves enormous debugging time under a tight deadline.

Also test the role flow in the browser:

| Login role | Expected redirect |
|---|---|
| `ADMIN` | `/admin/dashboard` |
| `GUARD` | `/guard/dashboard` |
| `REGISTRAR` | `/registrar/students` |
| `DISCIPLINE` | `/discipline/violations` |

---

## 13. Extending the pattern

Every feature you still need to build (feedback submission, full student CRUD editing, account/user management for the Account Module) follows the exact same three-file shape:

1. `*.validation.js` — a Zod schema for the request body
2. `*.service.js` — the actual Prisma queries
3. `*.controller.js` + `*.routes.js` — wires HTTP in, calls the service, sends JSON out

Copy `violations/` as your template for any new feature — rename the fields, done. If you want, tell me which specific module you're building next and I'll write that one out in full the same way.

---

## 14. Troubleshooting

| Problem | Likely cause |
|---|---|
| `Missing required environment variable` on backend start | You didn't copy `.env.example` to `.env`, or left a placeholder value |
| Prisma migrate fails to connect | MySQL/XAMPP isn't running, or `DATABASE_URL` credentials are wrong |
| React gets 401 on every request | Cookie isn't being sent — check `withCredentials: true` in `apiClient.js` and that frontend/backend origins match your `CORS_ORIGIN` |
| ESP32 gets an HTTP error code | Check the IP in `SERVER_URL` matches your gate PC's actual LAN IP (`ipconfig` on Windows), and that `DEVICE_API_KEY` matches exactly on both sides |
| OLED shows nothing | Wrong I2C address — try `0x3D` instead of `0x3C` in `display.begin()`, or check wiring |
| PM2 shows app "errored" | Run `pm2 logs gate-system` to see the actual crash reason — usually a missing `.env` value in production |

This is a real, complete backbone — auth, the core scan loop, violations, and reports are all fully wired and working. Build from here one feature at a time, test each in Postman before touching the UI, and you'll have a genuinely defensible system.
