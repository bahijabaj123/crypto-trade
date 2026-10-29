import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { PageBreadcrumbComponent } from '../../shared/components/common/page-breadcrumb/page-breadcrumb.component';
import { CryptoApiService, messageErreur } from '../../shared/services/crypto-api.service';
import { AnalyseRisque, PortefeuilleVue } from '../../shared/models/crypto.models';

// On importe le composant de Sarra
import { ProjectionChartComponent } from '../../shared/components/projection-chart/projection-chart.component';

@Component({
  selector: 'app-analysis',
  standalone: true,
  imports: [CommonModule, RouterLink, PageBreadcrumbComponent, ProjectionChartComponent],
  templateUrl: './analysis.component.html',
  styleUrls: ['./analysis.component.css']
})
export class AnalysisComponent implements OnInit {
  private readonly api = inject(CryptoApiService);

  // Pour les métriques de risque en haut
  readonly analyse = signal<AnalyseRisque | null>(null);
  
  // Pour les positions ouvertes en bas
  readonly portefeuille = signal<PortefeuilleVue | null>(null);

  ngOnInit(): void {
    this.chargerAnalyse();
    this.chargerPortefeuille();
  }

  chargerAnalyse(): void {
    this.api.getRisque().subscribe((a) => this.analyse.set(a));
  }

  chargerPortefeuille(): void {
    this.api.getPortefeuille().subscribe((p) => this.portefeuille.set(p));
  }

  // Utilitaires pour l'affichage
  signe(valeur: number): string {
    return valeur >= 0 ? '+' : '';
  }

  couleur(valeur: number): string {
    return valeur >= 0 ? 'text-success-500' : 'text-error-500';
  }

  prixObsoletes(p: PortefeuilleVue): boolean {
    return p.positionsOuvertes.some(pos => !pos.prixDisponible);
  }
}