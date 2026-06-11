import { Component, OnDestroy, input, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PresenceUser } from '../../core/services/policy-editor-collaboration.service';

@Component({
  selector: 'app-policy-editor-presence',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="presence-compact" [attr.aria-label]="'Usuarios conectados: ' + users().length">
      <span class="presence-compact__label">En línea</span>
      <span class="presence-compact__count">{{ users().length }}</span>
      <div class="presence-compact__avatars" *ngIf="users().length">
        @for (user of users(); track user.user_id) {
          <span
            class="presence-compact__avatar-wrap"
            (mouseenter)="onAvatarEnter(user)"
            (mouseleave)="onAvatarLeave()"
          >
            <span class="presence-compact__avatar">
              {{ getUserInitials(user) }}
            </span>

            @if (hoveredUser()?.user_id === user.user_id) {
              <div class="presence-tooltip" role="tooltip">
                <strong>{{ user.user_name }}</strong>
                <span>{{ user.user_email }}</span>
              </div>
            }
          </span>
        }
      </div>
    </div>
  `,
  styles: [`
    .presence-compact {
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      height: 2.25rem;
      padding: 0 0.55rem 0 0.65rem;
      border: 1px solid #dbe5f0;
      border-radius: 999px;
      background: #f8fafc;
      white-space: nowrap;
    }

    .presence-compact__label {
      font-size: 0.72rem;
      font-weight: 600;
      color: #64748b;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }

    .presence-compact__count {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 1.15rem;
      height: 1.15rem;
      padding: 0 0.25rem;
      border-radius: 999px;
      background: #dbeafe;
      color: #1d4ed8;
      font-size: 0.68rem;
      font-weight: 700;
      line-height: 1;
    }

    .presence-compact__avatars {
      display: inline-flex;
      align-items: center;
      padding-left: 0.15rem;
    }

    .presence-compact__avatar-wrap {
      position: relative;
      display: inline-flex;
      margin-left: -0.35rem;
    }

    .presence-compact__avatar-wrap:first-child {
      margin-left: 0;
    }

    .presence-compact__avatar {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 1.55rem;
      height: 1.55rem;
      border: 2px solid #f8fafc;
      border-radius: 999px;
      background: #2563eb;
      color: #fff;
      font-size: 0.58rem;
      font-weight: 700;
      line-height: 1;
      cursor: default;
    }

    .presence-tooltip {
      position: absolute;
      z-index: 120;
      top: calc(100% + 0.45rem);
      left: 50%;
      transform: translateX(-50%);
      min-width: 10rem;
      max-width: 14rem;
      padding: 0.55rem 0.65rem;
      border: 1px solid #e2e8f0;
      border-radius: 0.55rem;
      background: #fff;
      box-shadow: 0 10px 24px rgba(15, 23, 42, 0.14);
      display: flex;
      flex-direction: column;
      gap: 0.15rem;
      pointer-events: none;
      white-space: normal;
      animation: presence-tooltip-in 0.12s ease;
    }

    .presence-tooltip::before {
      content: '';
      position: absolute;
      top: -0.35rem;
      left: 50%;
      transform: translateX(-50%) rotate(45deg);
      width: 0.55rem;
      height: 0.55rem;
      background: #fff;
      border-top: 1px solid #e2e8f0;
      border-left: 1px solid #e2e8f0;
    }

    .presence-tooltip strong {
      font-size: 0.8125rem;
      font-weight: 600;
      color: #0f172a;
      line-height: 1.3;
    }

    .presence-tooltip span {
      font-size: 0.75rem;
      color: #64748b;
      line-height: 1.35;
      word-break: break-word;
    }

    @keyframes presence-tooltip-in {
      from {
        opacity: 0;
        transform: translateX(-50%) translateY(-2px);
      }

      to {
        opacity: 1;
        transform: translateX(-50%) translateY(0);
      }
    }
  `],
})
export class PolicyEditorPresenceComponent implements OnDestroy {
  private static readonly HIDE_DELAY_MS = 300;

  readonly users = input<PresenceUser[]>([]);
  readonly hoveredUser = signal<PresenceUser | null>(null);

  private hideTooltipTimeout: ReturnType<typeof setTimeout> | null = null;

  ngOnDestroy(): void {
    this.clearHideTimeout();
  }

  onAvatarEnter(user: PresenceUser): void {
    this.clearHideTimeout();
    this.hoveredUser.set(user);
  }

  onAvatarLeave(): void {
    this.clearHideTimeout();
    this.hideTooltipTimeout = setTimeout(() => {
      this.hoveredUser.set(null);
      this.hideTooltipTimeout = null;
    }, PolicyEditorPresenceComponent.HIDE_DELAY_MS);
  }

  getUserInitials(user: PresenceUser): string {
    const parts = user.user_name.split(' ').filter(Boolean);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return user.user_name.substring(0, 2).toUpperCase();
  }

  private clearHideTimeout(): void {
    if (this.hideTooltipTimeout) {
      clearTimeout(this.hideTooltipTimeout);
      this.hideTooltipTimeout = null;
    }
  }
}
