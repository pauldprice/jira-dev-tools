import { WebClient } from '@slack/web-api';
import { DateTime } from 'luxon';
import { SlackMessage, ActivityItem } from './types';
import { logger } from '../enhanced-logger';
import { CacheManager } from '../cache-manager';

export class SlackActivityClient {
  private client: WebClient;
  private userId?: string;
  private cacheManager: CacheManager;

  constructor(token: string) {
    this.client = new WebClient(token);
    this.cacheManager = new CacheManager();
  }

  async initialize(): Promise<void> {
    try {
      const authResult = await this.client.auth.test();
      this.userId = authResult.user_id as string;
      logger.debug(`Slack authenticated as user: ${authResult.user}`);
    } catch (error) {
      throw new Error(`Failed to authenticate with Slack: ${error}`);
    }
  }

  async fetchDayActivity(date: DateTime): Promise<ActivityItem[]> {
    const startOfDay = date.startOf('day');
    const endOfDay = date.endOf('day');
    
    const cacheKey = `slack-activity:${date.toISODate()}`;
    const cached = await this.cacheManager.get(cacheKey);
    if (cached) {
      logger.debug('Using cached Slack activity');
      return cached as ActivityItem[];
    }

    const activities: ActivityItem[] = [];
    
    try {
      // Fetch conversations the user participated in
      const conversations = await this.getActiveConversations(startOfDay, endOfDay);
      
      for (const conversation of conversations) {
        const messages = await this.getConversationMessages(
          conversation.id,
          startOfDay.toSeconds(),
          endOfDay.toSeconds()
        );
        
        if (messages.length > 0) {
          const activity = await this.processConversation(conversation, messages);
          if (activity) {
            activities.push(activity);
          }
        }
      }
      
      // Sort by start time
      activities.sort((a, b) => a.startTime.toMillis() - b.startTime.toMillis());
      
      await this.cacheManager.set(cacheKey, activities);
      return activities;
    } catch (error) {
      logger.error('Failed to fetch Slack activity:', error);
      return [];
    }
  }

  private async getActiveConversations(startDate: DateTime, endDate: DateTime): Promise<any[]> {
    const conversations: any[] = [];
    
    try {
      // Get all channels user is member of
      const channelsResult = await this.client.users.conversations({
        user: this.userId,
        types: 'public_channel,private_channel,mpim,im',
        limit: 200
      });
      
      if (channelsResult.channels) {
        for (const channel of channelsResult.channels) {
          // Check if there was activity in this time period
          const historyResult = await this.client.conversations.history({
            channel: channel.id!,
            oldest: startDate.toSeconds().toString(),
            latest: endDate.toSeconds().toString(),
            limit: 1
          });
          
          if (historyResult.messages && historyResult.messages.length > 0) {
            conversations.push(channel);
          }
        }
      }
    } catch (error) {
      logger.error('Error fetching conversations:', error);
    }
    
    return conversations;
  }

  private async getConversationMessages(
    channelId: string,
    oldest: number,
    latest: number
  ): Promise<SlackMessage[]> {
    const messages: SlackMessage[] = [];
    let cursor: string | undefined;
    
    try {
      do {
        const result = await this.client.conversations.history({
          channel: channelId,
          oldest: oldest.toString(),
          latest: latest.toString(),
          cursor,
          limit: 200,
          inclusive: true
        });
        
        if (result.messages) {
          for (const msg of result.messages) {
            if (msg.type === 'message' && msg.user && msg.text) {
              // Get user info
              const userInfo = await this.getUserInfo(msg.user);
              
              messages.push({
                user: userInfo?.real_name || msg.user,
                text: msg.text,
                timestamp: msg.ts!,
                channel: channelId,
                thread_ts: msg.thread_ts
              });
              
              // Get thread replies if this is a parent message
              if (msg.thread_ts === msg.ts && msg.reply_count && msg.reply_count > 0) {
                const replies = await this.getThreadReplies(channelId, msg.ts!);
                messages.push(...replies);
              }
            }
          }
        }
        
        cursor = result.response_metadata?.next_cursor;
      } while (cursor);
    } catch (error) {
      logger.error(`Error fetching messages for channel ${channelId}:`, error);
    }
    
    return messages;
  }

  private async getThreadReplies(channelId: string, threadTs: string): Promise<SlackMessage[]> {
    const replies: SlackMessage[] = [];
    
    try {
      const result = await this.client.conversations.replies({
        channel: channelId,
        ts: threadTs,
        limit: 200
      });
      
      if (result.messages) {
        for (const msg of result.messages.slice(1)) { // Skip parent message
          if (msg.user && msg.text) {
            const userInfo = await this.getUserInfo(msg.user);
            replies.push({
              user: userInfo?.real_name || msg.user,
              text: msg.text,
              timestamp: msg.ts!,
              channel: channelId,
              thread_ts: threadTs
            });
          }
        }
      }
    } catch (error) {
      logger.error(`Error fetching thread replies:`, error);
    }
    
    return replies;
  }

  private async getUserInfo(userId: string): Promise<any> {
    const cacheKey = `slack-user:${userId}`;
    const cached = await this.cacheManager.get(cacheKey);
    if (cached) return cached;
    
    try {
      const result = await this.client.users.info({ user: userId });
      await this.cacheManager.set(cacheKey, result.user);
      return result.user;
    } catch (error) {
      logger.debug(`Failed to get user info for ${userId}`);
      return null;
    }
  }

  private async processConversation(
    channel: any,
    messages: SlackMessage[]
  ): Promise<ActivityItem | null> {
    if (messages.length === 0) return null;
    
    // Sort messages by timestamp
    messages.sort((a, b) => parseFloat(a.timestamp) - parseFloat(b.timestamp));
    
    const startTime = DateTime.fromSeconds(parseFloat(messages[0].timestamp));
    const endTime = DateTime.fromSeconds(parseFloat(messages[messages.length - 1].timestamp));
    
    // Get unique participants
    const participants = [...new Set(messages.map(m => m.user))];
    
    // Get channel info
    const channelName = channel.name || channel.id;
    const isDirectMessage = channel.is_im || channel.is_mpim;
    
    // Prepare content for summarization
    const conversationText = messages
      .map(m => `${m.user}: ${m.text}`)
      .join('\n');
    
    return {
      startTime,
      endTime,
      participants,
      channel: isDirectMessage ? undefined : `#${channelName}`,
      title: isDirectMessage 
        ? `Direct message with ${participants.filter(p => p !== this.userId).join(', ')}`
        : `Discussion in #${channelName}`,
      summary: conversationText.substring(0, 200) + '...', // Will be enhanced by LLM
      type: 'slack',
      rawContent: conversationText
    };
  }
}