# How to Use Prisma with Supabase in NestJS

## Overview

Your NestJS application is already configured to communicate with Supabase
through Prisma. The `PrismaService` is set up as a **Global** module, which
means you can inject it into any service or controller.

## Connection Setup

✅ **Already Configured:**

- `DATABASE_URL` in `.env` points to Supabase connection pooler
- `PrismaService` extends `PrismaClient` and handles connection lifecycle
- `PrismaModule` is marked as `@Global()` so it's available everywhere

## How to Use PrismaService

### 1. Inject PrismaService into Any Service

```typescript
import { Injectable } from "@nestjs/common"
import { PrismaService } from "../prisma/prisma.service"

@Injectable()
export class YourService {
  constructor(private readonly prisma: PrismaService) {}

  // Now you can use this.prisma to query Supabase
}
```

### 2. Inject PrismaService into Any Controller

```typescript
import { Controller, Get } from "@nestjs/common"
import { PrismaService } from "../prisma/prisma.service"

@Controller("users")
export class UsersController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async findAll() {
    return this.prisma.user.findMany()
  }
}
```

## Common Prisma Operations

### Create (INSERT)

```typescript
// Create a single record
const user = await this.prisma.user.create({
  data: {
    email: "user@example.com",
    name: "John Doe",
    age: 30,
  },
})

// Create multiple records
const users = await this.prisma.user.createMany({
  data: [
    { email: "user1@example.com", name: "User 1" },
    { email: "user2@example.com", name: "User 2" },
  ],
})
```

### Read (SELECT)

```typescript
// Find all records
const users = await this.prisma.user.findMany()

// Find with filters
const activeUsers = await this.prisma.user.findMany({
  where: {
    active: true,
    age: { gte: 18 },
  },
})

// Find one record by unique field
const user = await this.prisma.user.findUnique({
  where: { id: 1 },
})

// Find first matching record
const user = await this.prisma.user.findFirst({
  where: { email: "user@example.com" },
})

// Find with pagination
const users = await this.prisma.user.findMany({
  skip: 0,
  take: 10,
  orderBy: { createdAt: "desc" },
})

// Count records
const count = await this.prisma.user.count({
  where: { active: true },
})
```

### Update (UPDATE)

```typescript
// Update a record
const updatedUser = await this.prisma.user.update({
  where: { id: 1 },
  data: {
    name: "Jane Doe",
    age: 25,
  },
})

// Update many records
const result = await this.prisma.user.updateMany({
  where: { active: false },
  data: { active: true },
})

// Upsert (update if exists, create if not)
const user = await this.prisma.user.upsert({
  where: { email: "user@example.com" },
  update: { name: "Updated Name" },
  create: {
    email: "user@example.com",
    name: "New User",
  },
})
```

### Delete (DELETE)

```typescript
// Delete a record
await this.prisma.user.delete({
  where: { id: 1 },
})

// Delete many records
await this.prisma.user.deleteMany({
  where: { active: false },
})
```

## Advanced Queries

### Relations (JOIN)

```typescript
// Include related data
const usersWithPosts = await this.prisma.user.findMany({
  include: {
    posts: true,
  },
})

// Select specific fields
const users = await this.prisma.user.findMany({
  select: {
    id: true,
    email: true,
    posts: {
      select: {
        title: true,
        content: true,
      },
    },
  },
})
```

### Raw SQL Queries

```typescript
// Raw query
const users = await this.prisma.$queryRaw`
  SELECT * FROM "User" WHERE "age" > ${18}
`

// Raw query with Prisma.sql
import { Prisma } from "@prisma/client"
const users = await this.prisma.$queryRaw(
  Prisma.sql`SELECT * FROM "User" WHERE "active" = true`,
)
```

### Transactions

```typescript
// Sequential operations in a transaction
await this.prisma.$transaction(async (tx) => {
  const user = await tx.user.create({
    data: { email: 'user@example.com', name: 'John' }
  });

  await tx.post.create({
    data: {
      title: 'My Post',
      userId: user.id
    }
  });
});

// Batch operations
await this.prisma.$transaction([
  this.prisma.user.create({ data: {...} }),
  this.prisma.post.create({ data: {...} })
]);
```

## Error Handling

Prisma errors are automatically handled by your `GlobalExceptionFilter`:

- **P2002** (Unique constraint) → `409 Conflict` with field errors
- **P2025** (Record not found) → `404 Not Found`
- Other errors → Mapped to appropriate HTTP status codes

```typescript
try {
  const user = await this.prisma.user.create({
    data: { email: "existing@example.com" },
  })
} catch (error) {
  if (error.code === "P2002") {
    // Handle duplicate email
  }
  throw error // Let GlobalExceptionFilter handle it
}
```

## Testing Connection

Test your Supabase connection:

```bash
# Start your app
npm run docker

# Test the connection endpoint
curl http://localhost:3001/health/db
```

## Next Steps

1. **Define your Prisma Schema**: Add models to `prisma/schema.prisma`
2. **Generate Prisma Client**: Run `npx prisma generate`
3. **Create Migrations**: Run `npx prisma migrate dev`
4. **Use Prisma Studio**: Run `npx prisma studio` to view/edit data visually

## Example: Complete CRUD Service

```typescript
import { Injectable, NotFoundException } from "@nestjs/common"
import { PrismaService } from "../prisma/prisma.service"
import { CreateUserDto, UpdateUserDto } from "./dto"

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createUserDto: CreateUserDto) {
    return this.prisma.user.create({
      data: createUserDto,
    })
  }

  async findAll() {
    return this.prisma.user.findMany({
      orderBy: { createdAt: "desc" },
    })
  }

  async findOne(id: number) {
    const user = await this.prisma.user.findUnique({
      where: { id },
    })

    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`)
    }

    return user
  }

  async update(id: number, updateUserDto: UpdateUserDto) {
    return this.prisma.user.update({
      where: { id },
      data: updateUserDto,
    })
  }

  async remove(id: number) {
    return this.prisma.user.delete({
      where: { id },
    })
  }
}
```

## Resources

- [Prisma Documentation](https://www.prisma.io/docs)
- [Prisma Client API Reference](https://www.prisma.io/docs/reference/api-reference/prisma-client-reference)
- [Supabase + Prisma Guide](https://supabase.com/docs/guides/integrations/prisma)
