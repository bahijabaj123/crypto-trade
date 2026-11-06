import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';

import { MarketService, MarketType } from '../../core/services/market.service';
import { TickerData } from '../../core/models/ticker.model';

@Component({
  selector: 'app-market',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './market.component.html',
  styleUrls: ['./market.component.css']
})
export class MarketComponent implements OnInit, OnDestroy {

  // Marché actif
  activeMarket: MarketType = 'crypto';

  // Données
  allTickers: TickerData[] = [];
  filteredTickers: TickerData[] = [];
  displayedTickers: TickerData[] = [];

  // Filtres
  searchTerm = '';
  sortBy: 'volume' | 'change' | 'price' | 'symbol' = 'volume';
  sortDirection: 'asc' | 'desc' = 'desc';

  // Pagination
  currentPage = 1;
  pageSize = 50;
  totalPages = 1;

  loading = true;
  error = '';

  private routeSub?: Subscription;

  constructor(
    private marketService: MarketService,
    private route: ActivatedRoute,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {}

    ngOnInit(): void {
    // On écoute l'URL (ex: /market/crypto ou /market/stocks)
    this.routeSub = this.route.params.subscribe(params => {
      const type = params['type'] as MarketType;
      
      if (type && ['crypto', 'stocks', 'forex', 'commodities'].includes(type)) {
        this.activeMarket = type;
        this.marketService.setActiveMarket(type);
        this.searchTerm = ''; 
        this.currentPage = 1;
        
        // On lance le chargement (qui va d'abord vider l'écran)
        this.loadData();
      } else {
        this.router.navigate(['/market/crypto']);
      }
    });
  }

  ngOnDestroy(): void {
    this.routeSub?.unsubscribe();
  }

  // ============================================================
  // CHARGEMENT DES DONNÉES
  // ============================================================
        private loadData(): void {
    this.loading = true;
    this.error = '';
    
    // 1. On vide TOUT immédiatement pour ne pas voir l'ancien marché
    this.allTickers = [];
    this.filteredTickers = [];
    this.displayedTickers = [];
    this.cdr.detectChanges();

    this.marketService.getTickers(true).subscribe({
      next: (data) => {
        // 2. Si on a des données, on les affiche
        if (data && data.length > 0) {
          this.allTickers = data;
          this.applyFilters();
        }
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Erreur chargement marché:', err);
        this.error = 'L\'API est temporairement surchargée (Quota atteint). Veuillez patienter 1 minute.';
        this.loading = false;
        this.cdr.detectChanges();
      }
    });
  }
  // ============================================================
  // FILTRES & TRI
  // ============================================================
  applyFilters(): void {
    let result = [...this.allTickers];

    if (this.searchTerm.trim()) {
      const term = this.searchTerm.toUpperCase();
      result = result.filter(t => 
        t.symbol.toUpperCase().includes(term) || 
        (t.name && t.name.toUpperCase().includes(term))
      );
    }

    result.sort((a, b) => {
      let comparison = 0;
      switch (this.sortBy) {
        case 'volume': comparison = (a.volume || 0) - (b.volume || 0); break;
        case 'change': comparison = a.changePercent - b.changePercent; break;
        case 'price': comparison = a.price - b.price; break;
        case 'symbol': comparison = a.symbol.localeCompare(b.symbol); break;
      }
      return this.sortDirection === 'asc' ? comparison : -comparison;
    });

    this.filteredTickers = result;
    this.totalPages = Math.ceil(result.length / this.pageSize) || 1;
    this.currentPage = 1;
    this.updateDisplayedTickers();
  }

  updateDisplayedTickers(): void {
    const start = (this.currentPage - 1) * this.pageSize;
    const end = start + this.pageSize;
    this.displayedTickers = this.filteredTickers.slice(start, end);
    this.cdr.detectChanges();
  }

  onSearchChange(): void {
    this.applyFilters();
  }

  onSortChange(field: 'volume' | 'change' | 'price' | 'symbol'): void {
    if (this.sortBy === field) {
      this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortBy = field;
      this.sortDirection = 'desc';
    }
    this.applyFilters();
  }

  // ============================================================
  // PAGINATION
  // ============================================================
  goToPage(page: number): void {
    if (page < 1 || page > this.totalPages) return;
    this.currentPage = page;
    this.updateDisplayedTickers();
  }

  nextPage(): void {
    this.goToPage(this.currentPage + 1);
  }

  previousPage(): void {
    this.goToPage(this.currentPage - 1);
  }

  // ============================================================
  // UTILITAIRES D'AFFICHAGE
  // ============================================================
  formatPrice(price: number): string {
    if (price < 0.0001) return price.toFixed(8);
    if (price < 1) return price.toFixed(4);
    if (price < 100) return price.toFixed(2);
    return price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  formatVolume(volume: number): string {
    if (!volume) return '-';
    if (volume >= 1_000_000_000) return (volume / 1_000_000_000).toFixed(2) + 'B';
    if (volume >= 1_000_000) return (volume / 1_000_000).toFixed(2) + 'M';
    if (volume >= 1_000) return (volume / 1_000).toFixed(2) + 'K';
    return volume.toFixed(2);
  }

  getBaseFromSymbol(symbol: string): string {
    // Pour le forex, on ne coupe pas au USDT
    if (this.activeMarket === 'forex') return symbol;
    return symbol.replace('USDT', '');
  }
}