import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

export interface PointCourbe { t: number; v: number; m?: number; }
export interface MarqueOrdre { t: number; sens: 'ACHAT' | 'VENTE'; symbole: string; }

/** Courbe de valeur du portefeuille (SVG pur) : ligne du joueur, ligne du marché (buy & hold), repères des ordres. */
@Component({
  selector: 'app-portfolio-curve',
  standalone: true,
  imports: [CommonModule],
  template: `
    <svg [attr.viewBox]="'0 0 ' + W + ' ' + H" class="w-full h-auto" role="img" aria-label="Courbe du portefeuille">
      <!-- grille -->
      @for (g of grille; track g.y) {
        <line [attr.x1]="M.l" [attr.x2]="W - M.r" [attr.y1]="g.y" [attr.y2]="g.y" stroke="#1f2937" stroke-width="1"/>
        <text [attr.x]="M.l - 6" [attr.y]="g.y + 3" text-anchor="end" font-size="9" fill="#6b7280">{{ g.label }}</text>
      }
      <!-- niveau de départ -->
      <line [attr.x1]="M.l" [attr.x2]="W - M.r" [attr.y1]="yBase" [attr.y2]="yBase" stroke="#6b7280" stroke-dasharray="4 4" stroke-width="1"/>
      <!-- marché -->
      @if (cheminMarche) { <path [attr.d]="cheminMarche" fill="none" stroke="#6b7280" stroke-width="1.5" stroke-dasharray="3 3"/> }
      <!-- aire + ligne joueur -->
      @if (chemin) {
        <path [attr.d]="aire" [attr.fill]="gain ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)'"/>
        <path [attr.d]="chemin" fill="none" [attr.stroke]="gain ? '#22c55e' : '#ef4444'" stroke-width="2" stroke-linejoin="round"/>
      }
      <!-- ordres -->
      @for (o of reperes; track $index) {
        @if (o.sens === 'ACHAT') {
          <path [attr.d]="'M' + o.x + ' ' + (o.y - 9) + ' l5 8 h-10 z'" fill="#22c55e" stroke="#05080f" stroke-width="1"><title>Achat {{ o.symbole }}</title></path>
        } @else {
          <path [attr.d]="'M' + o.x + ' ' + (o.y + 9) + ' l5 -8 h-10 z'" fill="#ef4444" stroke="#05080f" stroke-width="1"><title>Vente {{ o.symbole }}</title></path>
        }
      }
      @if (!chemin) { <text [attr.x]="W / 2" [attr.y]="H / 2" text-anchor="middle" fill="#6b7280" font-size="12">Pas assez de données</text> }
    </svg>
    <div class="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-[10px] text-gray-500">
      <span class="flex items-center gap-1"><span class="inline-block w-3 h-0.5" [class]="gain ? 'bg-green-500' : 'bg-red-500'"></span>Ton portefeuille</span>
      <span class="flex items-center gap-1"><span class="inline-block w-3 border-t border-dashed border-gray-500"></span>Marché (acheter et garder)</span>
      <span class="flex items-center gap-1"><span class="text-green-500">▲</span> achat</span>
      <span class="flex items-center gap-1"><span class="text-red-500">▼</span> vente</span>
    </div>
  `
})
export class PortfolioCurveComponent {
  @Input() points: PointCourbe[] = [];
  @Input() ordres: MarqueOrdre[] = [];
  @Input() base = 10000;

  readonly W = 600; readonly H = 210;
  readonly M = { l: 46, r: 10, t: 12, b: 12 };

  private get bornes() {
    const vals = this.points.flatMap(p => p.m != null ? [p.v, p.m] : [p.v]).concat(this.base);
    let lo = Math.min(...vals), hi = Math.max(...vals);
    const pad = (hi - lo) * 0.08 || this.base * 0.02;
    return { lo: lo - pad, hi: hi + pad };
  }
  private x(t: number): number {
    const tmax = this.points.length ? this.points[this.points.length - 1].t || 1 : 1;
    return this.M.l + (t / tmax) * (this.W - this.M.l - this.M.r);
  }
  private y(v: number): number {
    const { lo, hi } = this.bornes;
    return this.M.t + (1 - (v - lo) / (hi - lo)) * (this.H - this.M.t - this.M.b);
  }
  get yBase(): number { return this.points.length ? this.y(this.base) : 0; }
  get gain(): boolean { return !this.points.length || this.points[this.points.length - 1].v >= this.base; }

  get chemin(): string {
    if (this.points.length < 2) return '';
    return this.points.map((p, i) => `${i ? 'L' : 'M'}${this.x(p.t).toFixed(1)} ${this.y(p.v).toFixed(1)}`).join(' ');
  }
  get aire(): string {
    if (!this.chemin) return '';
    const last = this.points[this.points.length - 1];
    return `${this.chemin} L${this.x(last.t).toFixed(1)} ${this.yBase.toFixed(1)} L${this.x(0).toFixed(1)} ${this.yBase.toFixed(1)} Z`;
  }
  get cheminMarche(): string {
    const pts = this.points.filter(p => p.m != null);
    if (pts.length < 2) return '';
    return pts.map((p, i) => `${i ? 'L' : 'M'}${this.x(p.t).toFixed(1)} ${this.y(p.m!).toFixed(1)}`).join(' ');
  }
  get grille(): { y: number; label: string }[] {
    if (this.points.length < 2) return [];
    const { lo, hi } = this.bornes;
    return [0, 0.25, 0.5, 0.75, 1].map(f => {
      const v = lo + (hi - lo) * f;
      return { y: this.y(v), label: Math.round(v).toLocaleString('fr-FR') };
    });
  }
  get reperes(): { x: number; y: number; sens: 'ACHAT' | 'VENTE'; symbole: string }[] {
    if (this.points.length < 2) return [];
    return this.ordres.map(o => {
      let p = this.points[0];
      for (const q of this.points) { if (q.t <= o.t) p = q; else break; }
      return { x: this.x(o.t), y: this.y(p.v), sens: o.sens, symbole: o.symbole };
    });
  }
}