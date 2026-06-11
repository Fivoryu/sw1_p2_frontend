import { CommonModule } from '@angular/common';
import { Component, DestroyRef, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ChatRealtimeService } from '../../../core/services/chat-realtime.service';
import { ChatService, ChatConversation, ChatMessage, SearchUserResult } from '../../../core/services/chat.service';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-chat-widget',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './chat-widget.component.html',
  styleUrl: './chat-widget.component.scss',
})
export class ChatWidgetComponent {
  private readonly chatService = inject(ChatService);
  private readonly chatRealtime = inject(ChatRealtimeService);
  private readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);

  readonly userId = computed(() => this.auth.getCurrentUser()?.id || '');

  readonly open = signal(false);
  readonly view = signal<'list' | 'chat'>('list');
  readonly conversations = signal<ChatConversation[]>([]);
  readonly activeConversation = signal<ChatConversation | null>(null);
  readonly messages = signal<ChatMessage[]>([]);
  readonly draft = signal('');
  readonly searchQuery = signal('');
  readonly searchResults = signal<SearchUserResult[]>([]);
  readonly unreadCount = signal(0);

  constructor() {
    effect(() => {
      const uid = this.userId();
      if (uid) this.chatRealtime.connect(uid);
    });

    effect(() => {
      const msg = this.chatRealtime.lastMessage();
      if (!msg) return;
      const activeId = this.activeConversation()?.id;
      if (msg.conversation_id !== activeId) return;
      const alreadyExists = this.messages().some(m => m.id === msg.id);
      if (alreadyExists) return;
      this.messages.update(m => [...m, msg]);
    });

    this.destroyRef.onDestroy(() => this.chatRealtime.disconnect());
  }

  convTitle(conv: ChatConversation): string {
    return conv.name || conv.members.find(m => m.user_id !== this.userId())?.user_name || 'Chat';
  }

  convAvatar(conv: ChatConversation): string {
    if (conv.type === 'group') return 'G';
    return conv.members.find(m => m.user_id !== this.userId())?.user_name?.charAt(0) || '?';
  }

  headerTitle(): string {
    if (this.view() === 'list') return 'Mensajes';
    const conv = this.activeConversation();
    if (!conv) return 'Chat';
    return conv.name || conv.members.find(m => m.user_id !== this.userId())?.user_name || 'Chat';
  }

  isOwnMessage(msg: ChatMessage): boolean {
    return msg.sender_id === this.userId();
  }

  toggle(): void {
    this.open.update(v => !v);
    if (this.open()) {
      this.loadConversations();
      this.unreadCount.set(0);
    }
  }

  goToList(): void {
    this.view.set('list');
    this.activeConversation.set(null);
  }

  loadConversations(): void {
    this.chatService.getConversations().subscribe(convs => this.conversations.set(convs));
  }

  search(): void {
    const q = this.searchQuery().trim();
    if (!q) return;
    this.chatService.searchUsers(q).subscribe(users => this.searchResults.set(users));
  }

  startDirectChat(user: SearchUserResult): void {
    this.chatService.createConversation('direct', [user.user_id]).subscribe(conv => {
      this.openConversation(conv);
      this.loadConversations();
      this.searchResults.set([]);
      this.searchQuery.set('');
    });
  }

  openConversation(conv: ChatConversation): void {
    this.activeConversation.set(conv);
    this.view.set('chat');
    this.chatService.getMessages(conv.id).subscribe(msgs => this.messages.set(msgs));
  }

  send(): void {
    const text = this.draft().trim();
    const conv = this.activeConversation();
    if (!text || !conv) return;
    this.draft.set('');
    this.chatService.sendMessage(conv.id, text).subscribe({
      next: () => { /* WS delivers the message */ },
      error: () => this.draft.set(text),
    });
  }
}
