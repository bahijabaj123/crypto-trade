import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { PageBreadcrumbComponent } from '../../shared/components/common/page-breadcrumb/page-breadcrumb.component';
import { BadgeComponent } from '../../shared/components/ui/badge/badge.component';
import { CryptoApiService } from '../../shared/services/crypto-api.service';
import { SimulatedOrdersService, SimulatedOrder } from '../../core/services/simulated-orders.service';
import { TransactionVue } from '../../shared/models/crypto.models';

type FiltreSource = 'TOUS' | 'CRYPTO' | 'SIMULES';
type FiltreSens = 'TOUS' | 'ACHAT' | 'VENTE';

@Component({
  selector: 'app-history',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, PageBreadcrumbComponent, BadgeComponent],
  templateUrl: './history.component.html',
  styleUrl: './history.component.css',
})
export class HistoryComponent implements OnInit {
  private readonly api = inject(CryptoApiService);
  public readonly simulatedOrdersService = inject(SimulatedOrdersService);

  // Filtres
  public readonly filtreSource = signal<FiltreSource>('TOUS');
  public readonly filtreSens = signal<FiltreSens>('TOUS');
  public readonly recherche = signal('');

  // Données
  public readonly transactionsCrypto = signal<TransactionVue[]>([]);
  public readonly transactionsSimulees = signal<SimulatedOrder[]>([]);
  
  public readonly chargement = signal(true);
  public readonly erreur = signal<string | null>(null);

  ngOnInit(): void {
    this.chargerHistorique();
  }

  private chargerHistorique(): void {
    this.chargement.set(true);
    this.erreur.set(null);

    // 1. Charger l'historique Crypto
    this.api.getTransactions().subscribe({
      next: (txs) => {
        this.transactionsCrypto.set(txs.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
        this.chargement.set(false);
      },
      error: (e) => {
        console.warn('Impossible de charger les transactions crypto :', e);
        this.chargement.set(false);
      }
    });

    // 2. Charger l'historique simulé
    this.transactionsSimulees.set(this.simulatedOrdersService.getAll().sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
  }

  // ============================================================
  // CALCUL DES TRANSACTIONS FILTRÉES (Recherche + Filtre + Tri)
  // ============================================================
  public readonly transactionsFiltrees = computed(() => {
    const source = this.filtreSource();
    const sens = this.filtreSens();
    const terme = this.recherche().toLowerCase().trim();

    // 1. Fusionner selon la source
    let touts: any[] = [];
    if (source === 'TOUS') touts = [...this.transactionsCrypto(), ...this.transactionsSimulees()];
    else if (source === 'CRYPTO') touts = [...this.transactionsCrypto()];
    else touts = [...this.transactionsSimulees()];

    // 2. Filtrer par sens
    if (sens !== 'TOUS') {
      touts = touts.filter(t => t.sens === sens);
    }

    // 3. Filtrer par recherche (symbole)
    if (terme) {
      touts = touts.filter(t => t.symbole.toLowerCase().includes(terme));
    }

    // 4. Trier par date
    return touts.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  });

  // ============================================================
  // EXPORT CSV
  // ============================================================
  public exporterCSV(): void {
    const lignes = this.transactionsFiltrees();
    if (lignes.length === 0) return;

    const entetes = ['Date', 'Source', 'Actif', 'Sens', 'Quantité', 'Prix', 'Montant'];
    const data = lignes.map(tx => [
      this.getDate(tx),
      this.isSimule(tx) ? 'Simulé' : 'Crypto',
      this.getSymbole(tx),
      this.getSens(tx),
      this.getQuantite(tx),
      this.getPrix(tx),
      this.getMontant(tx)
    ]);

    const csvContent = [entetes, ...data]
      .map(l => l.map(v => `"${String(v).replace(/"/g, '""')}"`).join(';'))
      .join('\r\n');

    // BOM pour que Excel gère les accents
    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `historique-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ============================================================
  // HELPERS
  // ============================================================
  public isSimule(tx: TransactionVue | SimulatedOrder): tx is SimulatedOrder {
    return (tx as SimulatedOrder).market !== undefined;
  }

  public getSymbole(tx: TransactionVue | SimulatedOrder): string { return tx.symbole; }
  public getSens(tx: TransactionVue | SimulatedOrder): string { return tx.sens; }
  public getQuantite(tx: TransactionVue | SimulatedOrder): number { return tx.quantite; }
  public getDate(tx: TransactionVue | SimulatedOrder): string { return tx.date; }
  public getPrix(tx: TransactionVue | SimulatedOrder): number {
    return this.isSimule(tx) ? tx.prixExecution : (tx.prix || 0);
  }
  public getMontant(tx: TransactionVue | SimulatedOrder): number {
    return this.isSimule(tx) ? tx.montantTotal : (tx.montant || 0);
  }
}