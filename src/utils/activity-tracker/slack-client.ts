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
      // Restore DateTime objects from cached data
      return (cached as any[]).map(item => ({
        ...item,
        startTime: DateTime.fromISO(item.startTime),
        endTime: DateTime.fromISO(item.endTime)
      }));
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
      logger.error(`Failed to fetch Slack activity: ${error}`);
      throw error; // Re-throw to let the main tool handle it
    }
  }

  private async getActiveConversations(startDate: DateTime, endDate: DateTime): Promise<any[]> {
    const conversations: any[] = [];
    const conversationsCacheKey = `slack-conversations:${this.userId}:${startDate.toISODate()}`;
    
    // Try to get cached conversation list first
    const cachedConversations = await this.cacheManager.get(conversationsCacheKey);
    if (cachedConversations) {
      logger.debug('Using cached conversation list');
      return cachedConversations as any[];
    }
    
    try {
      // Get all channels user is member of
      logger.debug(`Fetching conversations for user ${this.userId}`);
      const channelsResult = await this.client.users.conversations({
        user: this.userId,
        types: 'public_channel,private_channel,mpim,im',
        limit: 200
      });
      
      logger.debug(`Found ${channelsResult.channels?.length || 0} total channels for user`);
      
      if (channelsResult.channels) {
        for (const channel of channelsResult.channels) {
          try {
            // Check if there was activity in this time period
            // Add a small delay to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 100));
            
            const historyResult = await this.client.conversations.history({
              channel: channel.id!,
              oldest: startDate.toSeconds().toString(),
              latest: endDate.toSeconds().toString(),
              limit: 1
            });
            
            if (historyResult.messages && historyResult.messages.length > 0) {
              logger.debug(`Found activity in channel: ${channel.name || channel.id}`);
              conversations.push(channel);
            }
          } catch (channelError: any) {
            // Skip channels we can't access
            if (channelError.data?.error === 'not_in_channel') {
              logger.debug(`Bot not in channel: ${channel.name || channel.id}`);
            } else {
              logger.debug(`Error checking channel ${channel.name || channel.id}: ${channelError.data?.error || channelError.message}`);
            }
          }
        }
      }
      
      logger.debug(`Found ${conversations.length} channels with activity on ${startDate.toISODate()}`);
      
      // Cache the conversation list to avoid re-fetching on retry
      await this.cacheManager.set(conversationsCacheKey, conversations);
    } catch (error: any) {
      const errorMsg = error.data?.error || error.message;
      logger.error(`Error fetching conversations: ${errorMsg}`);
      
      if (errorMsg === 'missing_scope') {
        logger.error('Missing required Slack scopes. Make sure your token has these User Token Scopes:');
        logger.error('- channels:read (to list channels)');
        logger.error('- channels:history (to read public channel messages)');
        logger.error('- groups:read (to list private channels)');
        logger.error('- groups:history (to read private channel messages)'); 
        logger.error('- im:read (to list direct messages)');
        logger.error('- im:history (to read direct messages)');
        logger.error('- mpim:read (to list group direct messages)');
        logger.error('- mpim:history (to read group direct messages)');
        logger.error('- users:read (to get user information)');
        logger.error('Re-install your Slack app after adding these scopes.');
      }
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
        
        // Add small delay between pages to avoid rate limiting
        if (cursor) {
          await new Promise(resolve => setTimeout(resolve, 200));
        }
      } while (cursor);
    } catch (error) {
      logger.error(`Error fetching messages for channel ${channelId}: ${error}`);
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
      logger.error(`Error fetching thread replies: ${error}`);
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