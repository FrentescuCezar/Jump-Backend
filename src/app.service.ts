import { Injectable } from "@nestjs/common"
import { PrismaService } from "../prisma/prisma.service"

@Injectable()
export class AppService {
  constructor(private readonly prisma: PrismaService) {}

  getHello(): string {
    return "Hello World!"
  }

  /**
   * Example: Query data from Supabase using Prisma
   *
   * Since PrismaModule is @Global(), you can inject PrismaService
   * into any service or controller by adding it to the constructor.
   *
   * Example queries:
   *
   * // Find all records
   * const users = await this.prisma.user.findMany();
   *
   * // Find one record
   * const user = await this.prisma.user.findUnique({
   *   where: { id: 1 }
   * });
   *
   * // Create a record
   * const newUser = await this.prisma.user.create({
   *   data: {
   *     email: 'user@example.com',
   *     name: 'John Doe'
   *   }
   * });
   *
   * // Update a record
   * const updatedUser = await this.prisma.user.update({
   *   where: { id: 1 },
   *   data: { name: 'Jane Doe' }
   * });
   *
   * // Delete a record
   * await this.prisma.user.delete({
   *   where: { id: 1 }
   * });
   *
   * // Complex queries with relations
   * const usersWithPosts = await this.prisma.user.findMany({
   *   include: {
   *     posts: true
   *   }
   * });
   *
   * // Transactions
   * await this.prisma.$transaction([
   *   this.prisma.user.create({ data: {...} }),
   *   this.prisma.post.create({ data: {...} })
   * ]);
   */

  async testConnection() {
    try {
      // Test database connection
      await this.prisma.$queryRaw`SELECT 1`
      return {
        connected: true,
        message: "Successfully connected to Supabase via Prisma",
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to connect to Supabase"
      return { connected: false, error: message }
    }
  }
}
