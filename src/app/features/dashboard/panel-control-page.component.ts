import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { DashboardService } from '../../core/services/dashboard.service';
import { AuditPanelViewComponent } from '../../shared/components/dashboard/audit-panel-view.component';
import { DashboardPanelViewComponent } from '../../shared/components/dashboard/dashboard-panel-view.component';
import { GeneralPanelViewComponent } from '../../shared/components/dashboard/general-panel-view.component';

@Component({
  selector: 'app-panel-control-page',
  standalone: true,
  imports: [CommonModule, DashboardPanelViewComponent, AuditPanelViewComponent, GeneralPanelViewComponent],
  templateUrl: './panel-control-page.component.html',
  styleUrl: './panel-control-page.component.scss',
})
export class PanelControlPageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  readonly dashboardService = inject(DashboardService);

  readonly isAuditMode = computed(() => this.route.snapshot.data['mode'] === 'audit');

  ngOnInit(): void {
    if (this.isAuditMode()) {
      this.dashboardService.loadAuditPanel();
      return;
    }
    this.dashboardService.loadPanel();
  }
}
