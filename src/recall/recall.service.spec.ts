import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { PrismaService } from '../../prisma/prisma.service';
import { RecallService } from './recall.service';
import { AiContentService } from '../ai/ai-content.service';
import { RecallBotStatus, CalendarEventStatus } from '@prisma/client';
import { mockRecallApi, createMockPrisma } from '../../test/helpers/mocks.helper';
import { AppError } from '../errors/app-error';
import { ErrorCodes } from '../errors/error-codes';

// Mock p-queue to avoid ES module issues
jest.mock('p-queue', () => {
  return jest.fn().mockImplementation(() => ({
    add: jest.fn((fn) => Promise.resolve(fn())),
  }));
});

describe('RecallService', () => {
  let service: RecallService;
  let prisma: PrismaService;
  let httpService: HttpService;
  let aiContent: AiContentService;
  let configService: ConfigService;

  // Mock implementations
  const mockPrisma = createMockPrisma();
  const mockHttpService = {
    axiosRef: {
      post: jest.fn(),
      get: jest.fn(),
      delete: jest.fn(),
    },
  };
  const mockAiContent = {
    queueMeetingGeneration: jest.fn(),
  };
  const mockConfigService = {
    getOrThrow: jest.fn((key: string) => {
      if (key === 'RECALL_API_KEY') return 'test-api-key';
      if (key === 'RECALL_REGION') return 'us-west-2';
      return '10';
    }),
    get: jest.fn((key: string) => {
      if (key === 'RECALL_REGION') return 'us-west-2';
      if (key === 'RECALL_LEAD_MINUTES') return '10';
      if (key === 'RECALL_API_BASE_URL') return undefined;
      return undefined;
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RecallService,
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
        {
          provide: HttpService,
          useValue: mockHttpService,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: AiContentService,
          useValue: mockAiContent,
        },
      ],
    }).compile();

    service = module.get<RecallService>(RecallService);
    prisma = module.get<PrismaService>(PrismaService);
    httpService = module.get<HttpService>(HttpService);
    aiContent = module.get<AiContentService>(AiContentService);
    configService = module.get<ConfigService>(ConfigService);

    // Reset all mocks
    jest.clearAllMocks();
  });

  describe('ensureBotScheduled', () => {
    it('should create a bot when event has meeting URL', async () => {
      // Arrange
      const event = {
        id: 'event-1',
        userId: 'user-1',
        meetingUrl: 'https://zoom.us/j/123456',
        startTime: new Date(Date.now() + 3600000), // 1 hour from now
        meetingPlatform: 'ZOOM' as const,
      };

      (mockPrisma.recallBot.findUnique as jest.Mock).mockResolvedValue(null);
      (mockPrisma.meetingPreference.findUnique as jest.Mock).mockResolvedValue(
        null,
      );
      (mockHttpService.axiosRef.post as jest.Mock).mockResolvedValue(
        mockRecallApi.createBot('bot-123'),
      );
      (mockPrisma.recallBot.create as jest.Mock).mockResolvedValue({
        id: 'bot-123',
        calendarEventId: event.id,
        status: RecallBotStatus.SCHEDULED,
        leadTimeMinutes: 10,
        joinAt: new Date(event.startTime.getTime() - 10 * 60 * 1000),
        meetingUrl: event.meetingUrl,
        meetingPlatform: event.meetingPlatform,
      });

      // Act
      const result = await service.ensureBotScheduled(event as any);

      // Assert
      expect(result).toBeDefined();
      expect(result?.id).toBe('bot-123');
      expect(mockHttpService.axiosRef.post).toHaveBeenCalledWith(
        expect.stringContaining('/bot'),
        expect.objectContaining({
          meeting_url: event.meetingUrl,
          bot_name: 'Jump Notetaker',
          metadata: {
            calendarEventId: event.id,
            userId: event.userId,
          },
        }),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: expect.stringContaining('Token'),
          }),
        }),
      );
      expect(mockPrisma.recallBot.create).toHaveBeenCalled();
    });

    it('should skip bot creation when no meeting URL', async () => {
      // Arrange
      const event = {
        id: 'event-1',
        userId: 'user-1',
        meetingUrl: null,
        startTime: new Date(Date.now() + 3600000),
      };

      // Act
      const result = await service.ensureBotScheduled(event as any);

      // Assert
      expect(result).toBeNull();
      expect(mockHttpService.axiosRef.post).not.toHaveBeenCalled();
    });

    it('should replace cancelled bot with new one', async () => {
      // Arrange
      const event = {
        id: 'event-1',
        userId: 'user-1',
        meetingUrl: 'https://zoom.us/j/123456',
        startTime: new Date(Date.now() + 3600000),
        meetingPlatform: 'ZOOM' as const,
      };

      const existingBot = {
        id: 'bot-old',
        status: RecallBotStatus.CANCELLED,
      };

      (mockPrisma.recallBot.findUnique as jest.Mock).mockResolvedValue(
        existingBot,
      );
      (mockPrisma.recallBot.delete as jest.Mock).mockResolvedValue(
        existingBot,
      );
      (mockPrisma.meetingPreference.findUnique as jest.Mock).mockResolvedValue(
        null,
      );
      (mockHttpService.axiosRef.post as jest.Mock).mockResolvedValue(
        mockRecallApi.createBot('bot-new'),
      );
      (mockPrisma.recallBot.create as jest.Mock).mockResolvedValue({
        id: 'bot-new',
        status: RecallBotStatus.SCHEDULED,
      });

      // Act
      const result = await service.ensureBotScheduled(event as any);

      // Assert
      expect(mockPrisma.recallBot.delete).toHaveBeenCalledWith({
        where: { id: 'bot-old' },
      });
      expect(result?.id).toBe('bot-new');
    });

    it('should respect user leadMinutes preference', async () => {
      // Arrange
      const futureDate = new Date(Date.now() + 3600000); // 1 hour from now
      const event = {
        id: 'event-1',
        userId: 'user-1',
        meetingUrl: 'https://zoom.us/j/123456',
        startTime: futureDate,
        meetingPlatform: 'ZOOM' as const,
      };

      (mockPrisma.recallBot.findUnique as jest.Mock).mockResolvedValue(null);
      (mockPrisma.meetingPreference.findUnique as jest.Mock).mockResolvedValue(
        {
          leadMinutes: 15,
        },
      );
      (mockHttpService.axiosRef.post as jest.Mock).mockResolvedValue(
        mockRecallApi.createBot('bot-123'),
      );
      const createdBot = {
        id: 'bot-123',
        calendarEventId: event.id,
        status: RecallBotStatus.SCHEDULED,
        leadTimeMinutes: 15,
        joinAt: new Date(event.startTime.getTime() - 15 * 60 * 1000),
        meetingUrl: event.meetingUrl,
        meetingPlatform: event.meetingPlatform,
      };
      (mockPrisma.recallBot.create as jest.Mock).mockResolvedValue(createdBot);

      // Act
      const result = await service.ensureBotScheduled(event as any);

      // Assert
      expect(result).toBeDefined();
      expect(mockPrisma.recallBot.create).toHaveBeenCalled();
      const createCall = (mockPrisma.recallBot.create as jest.Mock).mock.calls[0];
      expect(createCall[0].data.leadTimeMinutes).toBe(15);
    });

    it('should skip scheduling for past events', async () => {
      // Arrange
      const event = {
        id: 'event-1',
        userId: 'user-1',
        meetingUrl: 'https://zoom.us/j/123456',
        startTime: new Date(Date.now() - 3600000), // 1 hour ago
        meetingPlatform: 'ZOOM' as const,
      };

      (mockPrisma.recallBot.findUnique as jest.Mock).mockResolvedValue(null);

      // Act
      const result = await service.ensureBotScheduled(event as any);

      // Assert
      expect(result).toBeNull();
      expect(mockHttpService.axiosRef.post).not.toHaveBeenCalled();
    });
  });

  describe('cancelBotForEvent', () => {
    it('should cancel active bot', async () => {
      // Arrange
      const eventId = 'event-1';
      const bot = {
        id: 'bot-123',
        status: RecallBotStatus.SCHEDULED,
      };

      (mockPrisma.recallBot.findUnique as jest.Mock).mockResolvedValue(bot);
      (mockHttpService.axiosRef.delete as jest.Mock).mockResolvedValue({
        data: { success: true },
      });
      (mockPrisma.recallBot.update as jest.Mock).mockResolvedValue({
        ...bot,
        status: RecallBotStatus.CANCELLED,
      });

      // Act
      await service.cancelBotForEvent(eventId);

      // Assert
      expect(mockHttpService.axiosRef.delete).toHaveBeenCalledWith(
        expect.stringContaining(`/bot/${bot.id}`),
        expect.any(Object),
      );
      expect(mockPrisma.recallBot.update).toHaveBeenCalledWith({
        where: { id: bot.id },
        data: { status: RecallBotStatus.CANCELLED },
      });
    });

    it('should ignore already cancelled bots', async () => {
      // Arrange
      const eventId = 'event-1';
      const bot = {
        id: 'bot-123',
        status: RecallBotStatus.CANCELLED,
      };

      (mockPrisma.recallBot.findUnique as jest.Mock).mockResolvedValue(bot);

      // Act
      await service.cancelBotForEvent(eventId);

      // Assert
      expect(mockHttpService.axiosRef.delete).not.toHaveBeenCalled();
    });

    it('should handle bot not found error gracefully', async () => {
      // Arrange
      const eventId = 'event-1';
      const bot = {
        id: 'bot-123',
        status: RecallBotStatus.SCHEDULED,
      };

      (mockPrisma.recallBot.findUnique as jest.Mock).mockResolvedValue(bot);
      const error: any = new Error('Not found');
      error.response = { status: 404 };
      (mockHttpService.axiosRef.delete as jest.Mock).mockRejectedValue(error);
      (mockPrisma.recallBot.update as jest.Mock).mockResolvedValue({
        ...bot,
        status: RecallBotStatus.CANCELLED,
      });

      // Act
      await service.cancelBotForEvent(eventId);

      // Assert
      expect(mockPrisma.recallBot.update).toHaveBeenCalled();
    });
  });

  describe('pollBotStatus', () => {
    it('should update bot status from SCHEDULED to IN_CALL', async () => {
      // Arrange
      const bot = {
        id: 'bot-123',
        status: RecallBotStatus.SCHEDULED,
        calendarEventId: 'event-1',
        calendarEvent: {
          startTime: new Date(Date.now() - 1000),
        },
        metadata: null,
      };

      (mockHttpService.axiosRef.get as jest.Mock).mockResolvedValue(
        mockRecallApi.getBot('in_call_recording', bot.id),
      );
      (mockPrisma.recallBot.update as jest.Mock).mockResolvedValue({
        ...bot,
        status: RecallBotStatus.IN_CALL,
      });

      // Act
      await service.pollBotStatus(bot as any);

      // Assert
      expect(mockPrisma.recallBot.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'bot-123' },
          data: expect.objectContaining({
            status: RecallBotStatus.IN_CALL,
          }),
        }),
      );
    });

    it('should capture media when status changes to DONE', async () => {
      // Arrange
      const bot = {
        id: 'bot-123',
        status: RecallBotStatus.IN_CALL,
        calendarEventId: 'event-1',
        calendarEvent: {
          startTime: new Date(Date.now() - 1000),
        },
        metadata: null,
      };

      (mockHttpService.axiosRef.get as jest.Mock)
        .mockResolvedValueOnce(mockRecallApi.getBotWithMedia(bot.id))
        .mockResolvedValueOnce(mockRecallApi.getBotWithMedia(bot.id));

      (mockPrisma.recallBot.findUnique as jest.Mock).mockResolvedValue({
        ...bot,
        calendarEvent: { id: 'event-1' },
      });
      (mockPrisma.meetingMedia.findFirst as jest.Mock).mockResolvedValue(null);
      (mockPrisma.meetingMedia.create as jest.Mock).mockResolvedValue({});
      (mockPrisma.calendarEvent.updateMany as jest.Mock).mockResolvedValue({
        count: 1,
      });
      (mockPrisma.recallBot.update as jest.Mock).mockResolvedValue({
        ...bot,
        status: RecallBotStatus.DONE,
      });

      // Act
      await service.pollBotStatus(bot as any);

      // Assert
      expect(mockPrisma.meetingMedia.create).toHaveBeenCalled();
      expect(mockPrisma.calendarEvent.updateMany).toHaveBeenCalledWith({
        where: { id: 'event-1' },
        data: { status: CalendarEventStatus.COMPLETED },
      });
      expect(mockAiContent.queueMeetingGeneration).toHaveBeenCalledWith(
        'event-1',
      );
    });

    it('should handle API errors gracefully', async () => {
      // Arrange
      const bot = {
        id: 'bot-123',
        status: RecallBotStatus.SCHEDULED,
        calendarEventId: 'event-1',
        calendarEvent: {
          startTime: new Date(Date.now() - 1000),
        },
        metadata: null,
      };

      (mockHttpService.axiosRef.get as jest.Mock).mockRejectedValue(
        new Error('Network error'),
      );

      // Act & Assert - should not throw
      await expect(service.pollBotStatus(bot as any)).resolves.not.toThrow();
    });
  });

  describe('proxyMediaDownload', () => {
    it('should stream media from download URL', async () => {
      // Arrange
      const media = {
        id: 'media-1',
        downloadUrl: 'https://recall.ai/video.mp4',
        type: 'VIDEO' as const,
      };

      const mockStream = {
        pipe: jest.fn(),
      };

      (mockHttpService.axiosRef.get as jest.Mock).mockResolvedValue({
        data: mockStream,
        headers: {
          'content-type': 'video/mp4',
          'content-length': '1024',
        },
      });

      const mockResponse = {
        setHeader: jest.fn(),
      };

      // Act
      await service.proxyMediaDownload(media as any, mockResponse as any);

      // Assert
      expect(mockHttpService.axiosRef.get).toHaveBeenCalledWith(
        media.downloadUrl,
        { responseType: 'stream' },
      );
      expect(mockResponse.setHeader).toHaveBeenCalledWith(
        'Content-Type',
        'video/mp4',
      );
      expect(mockResponse.setHeader).toHaveBeenCalledWith(
        'Content-Length',
        '1024',
      );
      expect(mockStream.pipe).toHaveBeenCalledWith(mockResponse);
    });

    it('should throw error when download URL is missing', async () => {
      // Arrange
      const media = {
        id: 'media-1',
        downloadUrl: null,
        type: 'VIDEO' as const,
      };

      const mockResponse = {
        setHeader: jest.fn(),
      };

      // Act & Assert
      await expect(
        service.proxyMediaDownload(media as any, mockResponse as any),
      ).rejects.toThrow(AppError);
    });
  });
});

