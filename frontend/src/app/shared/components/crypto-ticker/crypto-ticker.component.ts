import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';

interface CryptoPrice {
  symbol: string;
  price: number;
  change: number;
}

@Component({
  selector: 'app-crypto-ticker',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './crypto-ticker.component.html',
  styleUrls: ['./crypto-ticker.component.css']
})
export class CryptoTickerComponent implements OnInit, OnDestroy {

  cryptos: CryptoPrice[] = [
    { symbol: 'BTC/USDT', price: 67432.50, change: 2.34 },
    { symbol: 'ETH/USDT', price: 3245.80, change: -1.12 },
    { symbol: 'SOL/USDT', price: 142.30, change: 5.67 },
    { symbol: 'BNB/USDT', price: 714.20, change: 0.89 },
    { symbol: 'XRP/USDT', price: 1.34, change: -0.45 },
    { symbol: 'ADA/USDT', price: 0.58, change: 3.21 },
    { symbol: 'DOGE/USDT', price: 0.082, change: -2.10 },
    { symbol: 'AVAX/USDT', price: 38.75, change: 4.12 },
    { symbol: 'DOT/USDT', price: 7.82, change: 1.05 },
    { symbol: 'MATIC/USDT', price: 0.92, change: -3.44 },
  ];

  private intervalId: any;

  ngOnInit(): void {
    // Simulation de fluctuation des prix toutes les 3 secondes
    this.intervalId = setInterval(() => {
      this.cryptos = this.cryptos.map(c => {
        const variation = (Math.random() - 0.5) * c.price * 0.005;
        return {
          ...c,
          price: c.price + variation,
          change: c.change + (Math.random() - 0.5) * 0.2
        };
      });
    }, 3000);
  }

  ngOnDestroy(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }
  }

  formatPrice(price: number): string {
    if (price < 1) return price.toFixed(4);
    if (price < 100) return price.toFixed(2);
    return price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
}