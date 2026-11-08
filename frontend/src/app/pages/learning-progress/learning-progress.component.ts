import { Component, inject } from '@angular/core';
import { PageBreadcrumbComponent } from '../../shared/components/common/page-breadcrumb/page-breadcrumb.component';
import { NgApexchartsModule } from 'ng-apexcharts';
import { ApexAxisChartSeries, ApexChart, ApexDataLabels, ApexPlotOptions, ApexStroke, ApexXAxis, ApexYAxis, ApexGrid, ApexFill, ApexTooltip } from 'ng-apexcharts';
import { FormationService } from '../../shared/learning/services/formation.service';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-learning-progress',
  imports: [CommonModule, PageBreadcrumbComponent, NgApexchartsModule],
  templateUrl: './learning-progress.component.html',
  styleUrl: './learning-progress.component.css',
})
export class LearningProgressComponent {
  readonly formation = inject(FormationService);

  readonly stats = this.formation.getGlobalStats();
  readonly level = this.formation.getLearnerLevel();
  readonly skills = this.formation.getSkillProgress();
  readonly activities = this.formation.getActivityLog();
  readonly weekly = this.formation.getWeeklyActivity();

  // 👇 LA SEULE MODIFICATION EST ICI : On fusionne les succès existants avec le nouveau badge
  readonly achievements = [
    ...this.formation.getAchievements(),
    {
      id: 'actuaire-certifie',
      title: 'Actuaire Certifié',
      description: 'Terminer tous les cours d\'Actuariat',
      unlocked: this.formation.estCertifieActuaire(),
      progress: this.formation.estCertifieActuaire() ? 100 : 0,
      icon: 'award'
    }
  ];

  levelProgress(): number {
    return this.formation.getLevelProgressPercent();
  }

  readonly radarSeries: ApexAxisChartSeries = [
    {
      name: 'Compétences',
      data: this.skills.map((s) => s.percent),
    },
  ];

  readonly radarChart: ApexChart = {
    type: 'radar',
    height: 320,
    toolbar: { show: false },
    fontFamily: 'Outfit, sans-serif',
  };

  readonly radarXAxis: ApexXAxis = {
    categories: this.skills.map((s) => s.label.split(' ')[0]),
    labels: { style: { colors: '#848E9C' } },
  };

  readonly radarStroke: ApexStroke = { width: 2, colors: ['#0ECB81'] };
  readonly radarFill: ApexFill = { opacity: 0.2, colors: ['#0ECB81'] };
  readonly radarMarkers = { size: 4, colors: ['#0ECB81'], strokeWidth: 0 };

  readonly barSeries: ApexAxisChartSeries = [
    { name: 'Minutes', data: this.weekly.minutes },
    { name: 'XP', data: this.weekly.xp },
  ];

  readonly barChart: ApexChart = { type: 'bar', height: 280, toolbar: { show: false }, fontFamily: 'Outfit, sans-serif' };
  readonly barXAxis: ApexXAxis = { categories: this.weekly.categories, labels: { style: { colors: '#848E9C' } } };
  readonly barYAxis: ApexYAxis = { labels: { style: { colors: '#848E9C' } } };
  readonly barGrid: ApexGrid = { borderColor: '#2B3139' };
  readonly barPlot: ApexPlotOptions = { bar: { borderRadius: 6, columnWidth: '45%' } };
  readonly barColors = ['#0ECB81', '#F0B90B'];
  readonly barDataLabels: ApexDataLabels = { enabled: false };
  readonly barTooltip: ApexTooltip = { theme: 'dark' };
}