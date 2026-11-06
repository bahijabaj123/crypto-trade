import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PageBreadcrumbComponent } from '../../shared/components/common/page-breadcrumb/page-breadcrumb.component';

@Component({
  selector: 'app-analysis',
  standalone: true,
  imports: [CommonModule, PageBreadcrumbComponent],
  templateUrl: './analysis.component.html',
  styleUrls: ['./analysis.component.css']
})
export class AnalysisComponent {
  // 👋 Espace réservé pour Ramii (Analyse Technique)
}