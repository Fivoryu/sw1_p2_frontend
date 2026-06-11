import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { ApiService } from './api.service';

export interface ChatMember {
  user_id: string;
  user_name: string;
  role_name: string;
}

export interface ChatConversation {
  id: string;
  type: 'direct' | 'group';
  name?: string;
  members: ChatMember[];
  last_message_text?: string;
  last_message_sender_name?: string;
  last_message_at?: string;
  created_at: string;
  updated_at: string;
}

export interface ChatMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  sender_name: string;
  text: string;
  created_at: string;
}

export interface SearchUserResult {
  user_id: string;
  full_name: string;
  role_name: string;
  department_name?: string;
}

@Injectable({ providedIn: 'root' })
export class ChatService {
  private readonly api = inject(ApiService);

  getConversations(): Observable<ChatConversation[]> {
    return this.api.get<ChatConversation[]>('/chat/conversations');
  }

  createConversation(type: 'direct' | 'group', memberIds: string[], name?: string): Observable<ChatConversation> {
    return this.api.post<ChatConversation>('/chat/conversations', { type, member_ids: memberIds, name });
  }

  getMessages(conversationId: string, before?: string): Observable<ChatMessage[]> {
    let url = `/chat/conversations/${conversationId}/messages?limit=50`;
    if (before) url += `&before=${encodeURIComponent(before)}`;
    return this.api.get<ChatMessage[]>(url);
  }

  sendMessage(conversationId: string, text: string): Observable<ChatMessage> {
    return this.api.post<ChatMessage>(`/chat/conversations/${conversationId}/messages`, { text });
  }

  searchUsers(query: string): Observable<SearchUserResult[]> {
    return this.api.get<SearchUserResult[]>(`/chat/users/search?q=${encodeURIComponent(query)}`);
  }
}
