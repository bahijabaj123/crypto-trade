import { Component, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PageBreadcrumbComponent } from '../../shared/components/common/page-breadcrumb/page-breadcrumb.component';
import { NgApexchartsModule } from 'ng-apexcharts';
import { ApexOptions } from 'ng-apexcharts';
import { NiveauService } from '../../core/services/niveau.service';
import { NiveauSwitchComponent } from '../../shared/components/actuariat/niveau-switch.component';
import { BandeBienvenueComponent } from '../../shared/components/actuariat/bande-bienvenue.component';
import { TermeComponent } from '../../shared/components/actuariat/terme.component';
import { DemarcheComponent } from '../../shared/components/actuariat/demarche.component';

@Component({
  selector: 'app-mode-assureur',
  standalone: true,
  imports: [
    CommonModule, FormsModule, PageBreadcrumbComponent, NgApexchartsModule,
    NiveauSwitchComponent, BandeBienvenueComponent, TermeComponent, DemarcheComponent
  ],
  templateUrl: './mode-assureur.component.html'
})
export class ModeAssureurComponent {
  readonly niveau = inject(NiveauService);

  readonly anneeActuelle = signal(0);
  readonly capital = signal(200); // Capital de départ (k€)
  readonly historique = signal<{ annee: number; capital: number }[]>([{ annee: 0, capital: 200 }]);
  readonly journal = signal<{ annee: number; evenement: string; net: number }[]>([]);
  readonly partieTerminee = signal(false);
  readonly enRuine = signal(false);
  readonly dernierRatioCombine = signal<number | null>(null);

  readonly niveauPrime = signal(100);
  readonly reassurance = signal(20);

  // ✅ SOLVABILITÉ DYNAMIQUE (Capital / Capital Requis)
  // Le capital requis dépend de la volatilité (approche simplifiée Solvency II)
  readonly solvabilite = computed(() => {
    const cap = this.capital();
    // Capital requis : 100 k€ de base + 20% du capital (pour absorber les chocs)
    const requis = Math.max(50, 100 - (this.reassurance() * 0.5)); 
    return Math.round((cap / requis) * 100);
  });

  readonly chartOptions = signal<Partial<ApexOptions>>({
    series: [{ name: 'Capital (k€)', data: [200] }],
    chart: { type: 'area', height: 300, fontFamily: 'Outfit, sans-serif', toolbar: { show: false } },
    colors: ['#465fff'],
    fill: { type: 'gradient', gradient: { shadeIntensity: 1, opacityFrom: 0.4, opacityTo: 0.05 } },
    stroke: { curve: 'smooth', width: 3 },
    xaxis: { categories: ['Départ'], labels: { style: { colors: '#9ca3af' } } },
    yaxis: { labels: { style: { colors: '#9ca3af' }, formatter: (v: number) => `${v} k€` } },
    grid: { borderColor: 'rgba(255,255,255,0.05)' },
    dataLabels: { enabled: false },
    theme: { mode: 'dark' }
  });

  simulerAnnee(): void {
    if (this.partieTerminee()) return;

    const annee = this.anneeActuelle() + 1;
    const prime = this.niveauPrime();
    const quota = this.reassurance() / 100;

    // 1. Volatilité du marché (impact du niveau de prime sur les clients)
    const volatiliteMarche = Math.max(0.5, Math.min(1.35, 1 - 0.012 * (prime - 100)));
    
    // 2. Primes collectées (400 k€ de base ajusté)
    const primesCollectees = 400 * volatiliteMarche * (prime / 100);

    // 3. Sinistres (aléatoires avec événements majeurs)
    const evenementMajeur = Math.random() < 0.12; // 12% de chance
    const variation = 0.14; // 14% de volatilité
    const alea = this.gaussien();
    let sinistres = 280 * volatiliteMarche * Math.exp(variation * alea - (variation ** 2) / 2);
    if (evenementMajeur) sinistres *= 1.5; // Catastrophe

    // 4. Frais de gestion (15% des primes)
    const frais = 0.15 * primesCollectees;

    // 5. ✅ RÉASSURANCE RÉALISTE
    // L'assureur cède une part des primes ET des sinistres.
    // MAIS le réassureur prend une commission (30%), ce qui rend la réassurance coûteuse.
    const primesCedees = quota * primesCollectees;
    const sinistresCedes = quota * sinistres;
    const commissionReassurance = 0.30 * primesCedees; // Le réassureur se sert au passage

    const net = (primesCollectees - primesCedees) - (sinistres - sinistresCedes) - frais + commissionReassurance;

    // 6. Mise à jour du capital
    const nouveauCapital = this.capital() + net;
    const ruine = nouveauCapital < 0;

    this.capital.set(nouveauCapital);
    this.anneeActuelle.set(annee);
    this.historique.update(h => [...h, { annee, capital: nouveauCapital }]);
    this.dernierRatioCombine.set(((sinistres + frais) / primesCollectees) * 100);
    this.journal.update(j => [
      { annee, evenement: evenementMajeur ? '⚠️ Événement majeur' : 'Année normale', net: Math.round(net) },
      ...j
    ].slice(0, 5));

    if (ruine) {
      this.enRuine.set(true);
      this.partieTerminee.set(true);
    } else if (annee >= 10) {
      this.partieTerminee.set(true);
    }

    const categories = this.historique().map(h => h.annee === 0 ? 'Départ' : `An ${h.annee}`);
    const data = this.historique().map(h => Math.round(h.capital));
    this.chartOptions.update(opt => ({
      ...opt,
      series: [{ name: 'Capital (k€)', data }],
      xaxis: { ...opt.xaxis, categories }
    }));
  }

  reinitialiser(): void {
    this.anneeActuelle.set(0);
    this.capital.set(200);
    this.historique.set([{ annee: 0, capital: 200 }]);
    this.journal.set([]);
    this.partieTerminee.set(false);
    this.enRuine.set(false);
    this.dernierRatioCombine.set(null);
    this.niveauPrime.set(100);
    this.reassurance.set(20);
    this.chartOptions.update(opt => ({
      ...opt,
      series: [{ name: 'Capital (k€)', data: [200] }],
      xaxis: { ...opt.xaxis, categories: ['Départ'] }
    }));
  }

  private gaussien(): number {
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  get messageFin(): string {
    if (!this.partieTerminee()) return '';
    if (this.enRuine()) {
      return `💀 RUINE ! Votre capital est épuisé à l'année ${this.anneeActuelle()}. Essayez une prime plus haute ou plus de réassurance.`;
    }
    return `🏆 FÉLICITATIONS ! Vous avez survécu 10 ans. Capital final : ${Math.round(this.capital())} k€.`;
  }
}