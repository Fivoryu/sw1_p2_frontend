import { CommonModule } from '@angular/common';
import { Component, DestroyRef, HostListener, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { ContextService } from '../../../core/services/context.service';
import { AiService } from '../../../core/services/ai.service';
import { AIAssistantQueryResponseApi } from '../../../core/models/ai.models';

interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
  suggestions?: string[];
  action_type?: string | null;
  redirect_url?: string | null;
  redirect_label?: string | null;
}

@Component({
  selector: 'app-ai-assistant-widget',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './assistant-widget.component.html',
  styleUrl: './assistant-widget.component.scss',
})
export class AiAssistantWidgetComponent {
  private readonly destroyRef = inject(DestroyRef);
  private readonly authService = inject(AuthService);
  private readonly contextService = inject(ContextService);
  private readonly aiService = inject(AiService);
  private readonly router = inject(Router);

  readonly open = signal(false);
  readonly draft = signal('');
  readonly messages = signal<ChatMessage[]>([]);
  readonly loading = signal(false);
  readonly initialSuggestion = signal<string | null>(null);
  readonly suggestionCount = signal(0);

  readonly hasProactiveSuggestion = computed(() => this.suggestionCount() > 0);
  readonly hasMessages = computed(() => this.messages().length > 0);

  private showWelcome = true;
  private lastInteractionTime = 0;

  constructor() {
    this.destroyRef.onDestroy(() => this.handleDestroy());

    effect(() => {
      const suggestions = this.contextService.pendingSuggestions();
      if (!suggestions.length) return;
      if (Date.now() - this.lastInteractionTime < 120_000) return;
      this.suggestionCount.set(suggestions.length);
    });
  }

  @HostListener('window:keydown', ['$event'])
  onKeydown(event: KeyboardEvent): void {
    if ((event.ctrlKey || event.metaKey) && event.code === 'Space') {
      event.preventDefault();
      this.toggle();
    }
  }

  toggle(): void {
    this.open.update((v) => !v);
    if (this.open()) {
      this.lastInteractionTime = Date.now();
      this.suggestionCount.set(0);
      this.contextService.dismissCurrentSuggestions();
      if (this.showWelcome) {
        this.showWelcome = false;
        this.showInitialMessage();
      } else {
        const pending = this.contextService.pendingSuggestions();
        if (pending.length) {
          this.messages.update((msgs) => [
            ...msgs,
            { role: 'assistant', text: pending[0] },
          ]);
        }
      }
    }
  }

  send(): void {
    const text = this.draft().trim();
    if (!text || this.loading()) return;

    this.messages.update((msgs) => [...msgs, { role: 'user', text }]);
    this.draft.set('');
    this.loading.set(true);

    const context = this.contextService.currentContext();

    this.aiService.assistantQuery(text, context).subscribe({
      next: (response) => {
        this.messages.update((msgs) => [
          ...msgs,
          {
            role: 'assistant',
            text: response.answer,
            suggestions: response.suggestions,
            action_type: response.action_type,
            redirect_url: response.redirect_url,
            redirect_label: response.redirect_label,
          },
        ]);
        this.loading.set(false);
      },
      error: (error) => {
        this.messages.update((msgs) => [
          ...msgs,
          {
            role: 'assistant',
            text: 'Lo siento, no pude procesar tu consulta. Intentá de nuevo.',
          },
        ]);
        this.loading.set(false);
      },
    });
  }

  sendSuggestion(suggestion: string): void {
    this.draft.set(suggestion);
    this.send();
  }

  navigateTo(url: string): void {
    void this.router.navigateByUrl(url);
  }

  clearChat(): void {
    this.messages.set([]);
    this.showWelcome = true;
    this.initialSuggestion.set(null);
    this.suggestionCount.set(0);
    this.contextService.dismissCurrentSuggestions();
  }

  startVoiceInput(): void {
    if (!navigator.mediaDevices?.getUserMedia) {
      this.messages.update((msgs) => [
        ...msgs,
        { role: 'assistant', text: 'Tu navegador no soporta entrada de voz.' },
      ]);
      return;
    }

    navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
      const mediaRecorder = new MediaRecorder(stream);
      const chunks: BlobPart[] = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      mediaRecorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        const blob = new Blob(chunks, { type: 'audio/webm' });
        this.sendVoiceQuery(blob);
      };

      mediaRecorder.start();
      setTimeout(() => {
        if (mediaRecorder.state === 'recording') {
          mediaRecorder.stop();
        }
      }, 10000);
    }).catch(() => {
      this.messages.update((msgs) => [
        ...msgs,
        { role: 'assistant', text: 'No se pudo acceder al micrófono. Verificá los permisos.' },
      ]);
    });
  }

  private sendVoiceQuery(audioBlob: Blob): void {
    this.loading.set(true);
    const context = this.contextService.currentContext();

    this.aiService.assistantVoice(audioBlob, context).subscribe({
      next: (response) => {
        if (response.transcribed_text) {
          this.messages.update((msgs) => [
            ...msgs,
            { role: 'user', text: `[Voz] ${response.transcribed_text}` },
          ]);
        }
        this.messages.update((msgs) => [
          ...msgs,
          {
            role: 'assistant',
            text: response.answer,
            suggestions: response.suggestions,
            action_type: response.action_type,
            redirect_url: response.redirect_url,
            redirect_label: response.redirect_label,
          },
        ]);
        this.loading.set(false);
      },
      error: () => {
        this.messages.update((msgs) => [
          ...msgs,
          { role: 'assistant', text: 'No pude procesar el audio. Intentá escribir tu consulta.' },
        ]);
        this.loading.set(false);
      },
    });
  }

  private showInitialMessage(): void {
    const user = this.authService.getCurrentUser();
    const userName = user?.full_name ?? '';
    const proactive = this.contextService.getProactiveSuggestion();

    if (proactive) {
      this.initialSuggestion.set(proactive);
      this.messages.set([
        {
          role: 'assistant',
          text: `Hola ${userName ? userName.split(' ')[0] : ''}. Soy tu asistente de SW1. ${proactive}`,
        },
      ]);
    } else {
      this.messages.set([
        {
          role: 'assistant',
          text: `Hola ${userName ? userName.split(' ')[0] : ''}. Soy tu asistente de SW1. ¿En qué puedo ayudarte?`,
          suggestions: [
            '¿Cómo creo una nueva política?',
            '¿Cómo genero un reporte?',
            '¿Qué trámites tengo pendientes?',
            '¿Cómo subo un documento?',
          ],
        },
      ]);
    }
  }

  private handleDestroy(): void {
    this.messages.set([]);
  }
}
