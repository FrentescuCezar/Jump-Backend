import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit() {
    // Retry connection with exponential backoff
    // Supabase can be slow to respond initially, especially with connection pooling
    const maxRetries = 3;
    const baseDelay = 1000; // 1 second

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await this.$connect();
        this.logger.log('Database connection established');
        return; // Success, exit
      } catch (error) {
        if (attempt === maxRetries) {
          // Last attempt failed - log but don't throw
          // Prisma will connect lazily on first query anyway
          this.logger.warn(
            `Failed to connect to database after ${maxRetries} attempts. ` +
            'Prisma will connect lazily on first query.',
          );
          this.logger.debug('Connection error:', error);
        } else {
          // Wait before retrying with exponential backoff
          const delay = baseDelay * Math.pow(2, attempt - 1);
          this.logger.debug(
            `Database connection attempt ${attempt}/${maxRetries} failed. Retrying in ${delay}ms...`,
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}

