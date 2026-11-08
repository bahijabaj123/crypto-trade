import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PageBreadcrumbComponent } from '../../shared/components/common/page-breadcrumb/page-breadcrumb.component';
import { CryptoApiService } from '../../shared/services/crypto-api.service';
import { AnalyseRisque } from '../../shared/models/crypto.models';
import { FormationService } from '../../shared/learning/services/formation.service';
import { NgApexchartsModule } from 'ng-apexcharts';
import { ApexOptions } from 'ng-apexcharts';

@Component({
  selector: 'app-actuariat',
  standalone: true,
 imports: [CommonModule, FormsModule, PageBreadcrumbComponent, NgApexchartsModule],
  templateUrl: './actuariat.component.html',
  styleUrls: ['./actuariat.component.css']
})
export class ActuariatComponent {
  private readonly api = inject(CryptoApiService);
  public readonly formationService = inject(FormationService);

  // Données de risque du portefeuille
  readonly analyse = signal<AnalyseRisque | null>(null);
  
  // Paramètres du formulaire
  public montantAssure = 100000;
  public dureeContrat = 12;
  public franchise = 5;
  public typeContrat: 'VIE' | 'NON_VIE' = 'NON_VIE';
  
  // Résultats calculés
  readonly primeCalculee = signal<number>(0);
  readonly probabiliteSinistre = signal<number>(0);
  readonly provisionnement = signal<number>(0);

  // Bonus / Malus
  public multiplicateurRisque = 1;
  public malusConcentration = 0;
  public bonusFormation = 0;

    // ============================================================
  // GRAPHIQUES APEXCHARTS
  // ============================================================
  
  // 1. Graphique Donut (Répartition des coûts)
  public chartOptions: Partial<ApexOptions> = {
    series: [0, 0, 0],
    chart: {
      type: 'donut',
      height: 320,
      fontFamily: 'Outfit, sans-serif'
    },
    labels: ['Prime', 'Provision', 'Marge'],
    colors: ['#3b82f6', '#f59e0b', '#10b981'],
    legend: {
      position: 'bottom',
      labels: { colors: '#9ca3af' }
    },
    dataLabels: {
      enabled: true,
      formatter: (val: number) => `${Math.round(val)} %`
    },
    plotOptions: {
      pie: {
        donut: {
          size: '65%',
          labels: {
            show: true,
            name: { show: true, color: '#9ca3af' },
            value: { show: true, color: '#ffffff', formatter: (val: string) => `${val} €` },
            total: { show: true, label: 'Total', color: '#9ca3af' }
          }
        }
      }
    },
    theme: { mode: 'dark' },
    stroke: { show: false }
  };

  // 2. Graphique Courbe (Évolution de la prime sur 12 mois)
  public lineChartOptions: Partial<ApexOptions> = {
    series: [{ name: 'Prime mensuelle', data: [] }],
    chart: {
      type: 'area',
      height: 300,
      fontFamily: 'Outfit, sans-serif',
      toolbar: { show: false }
    },
    colors: ['#3b82f6'],
    fill: {
      type: 'gradient',
      gradient: { shadeIntensity: 1, opacityFrom: 0.4, opacityTo: 0.05 }
    },
    stroke: { curve: 'smooth', width: 3 },
    xaxis: {
      categories: ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'],
      labels: { style: { colors: '#9ca3af' } }
    },
    yaxis: {
      labels: { style: { colors: '#9ca3af' }, formatter: (val: number) => `${Math.round(val)} €` }
    },
    grid: { borderColor: 'rgba(255,255,255,0.05)' },
    dataLabels: { enabled: false },
    theme: { mode: 'dark' }
  };

  // Marge & Ratio S/P
  readonly margePrime = computed(() => this.primeCalculee() - this.provisionnement());
  readonly ratioSP = computed(() => {
    const prime = this.primeCalculee();
    if (prime === 0) return 0;
    return Math.round((this.provisionnement() / prime) * 100);
  });

  constructor() {
    this.chargerAnalyse();
  }

  private chargerAnalyse(): void {
    this.api.getRisque().subscribe({
      next: (a) => {
        this.analyse.set(a);
        this.calculerTout();
      },
      error: (e) => console.error('Erreur chargement analyse:', e)
    });
  }

  // 👇 LA MÉTHODE QUI MANQUAIT
  public changerType(type: 'VIE' | 'NON_VIE'): void {
    this.typeContrat = type;
    this.calculerTout();
  }

    public calculerTout(): void {
    const a = this.analyse();
    if (!a) return;

    // 1. Probabilité de sinistre
    const volatilite = a.volatiliteAnnuellePct ?? 20;
    const proba = Math.min(95, Math.max(1, volatilite * 1.5));
    this.probabiliteSinistre.set(Math.round(proba));

    // 2. Coût attendu (Provisionnement)
    const coutAttendu = this.montantAssure * (proba / 100) * (1 - this.franchise / 100);
    this.provisionnement.set(Math.round(coutAttendu));

    // 3. Calcul du Bonus/Malus
    this.calculerBonusMalus();
    
    // 4. Prime finale
    const primeDeBase = coutAttendu * 1.2;
    const primeFinale = primeDeBase * this.multiplicateurRisque;
    this.primeCalculee.set(Math.round(primeFinale));

    // 5. Mise à jour du graphique Donut
    const marge = Math.max(0, primeFinale - coutAttendu);
    this.chartOptions.series = [Math.round(primeFinale), Math.round(coutAttendu), Math.round(marge)];

    // 6. Mise à jour de la courbe (12 mois avec de légères variations)
    const primeMensuelle = primeFinale / 12;
    const courbe = Array.from({ length: 12 }, (_, i) => {
      const variation = 1 + (Math.sin(i) * 0.1); // Petite variation de +/- 10%
      return Math.round(primeMensuelle * variation);
    });
    this.lineChartOptions.series = [{ name: 'Prime mensuelle', data: courbe }];
  }

  private calculerBonusMalus(): void {
    const a = this.analyse();
    if (!a) return;

    // Malus : concentration du portefeuille (> 40% sur un actif)
    const exposition = a.expositionMaxPct ?? 0;
    this.malusConcentration = Math.max(0, Math.round((exposition - 40) * 0.5));

    // Bonus : modules de formation terminés
    const stats = this.formationService.getGlobalStats();
    const coursTermines = stats.modulesCompleted;
    this.bonusFormation = Math.min(20, coursTermines * 5);

    // Multiplicateur final
    this.multiplicateurRisque = 1 + (this.malusConcentration / 100) - (this.bonusFormation / 100);
    this.multiplicateurRisque = Math.max(0.5, Math.min(2.0, this.multiplicateurRisque));
  }

  // Helper pour l'affichage
  public formatMontant(value: number): string {
    return value.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
  }
}