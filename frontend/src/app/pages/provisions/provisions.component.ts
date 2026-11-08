import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NgApexchartsModule } from 'ng-apexcharts';
import { ApexOptions } from 'ng-apexcharts';
import { PageBreadcrumbComponent } from '../../shared/components/common/page-breadcrumb/page-breadcrumb.component';
import { NiveauService } from '../../core/services/niveau.service';
import { NiveauSwitchComponent } from '../../shared/components/actuariat/niveau-switch.component';
import { BandeBienvenueComponent } from '../../shared/components/actuariat/bande-bienvenue.component';
import { TermeComponent } from '../../shared/components/actuariat/terme.component';
import { DemarcheComponent } from '../../shared/components/actuariat/demarche.component';

export type Methode = 'CHAIN_LADDER' | 'BORNHUETTER_FERGUSON';

export interface LigneProvision {
  annee: number;
  dernierPaye: number;
  cdf: number;
  ultime: number;
  provision: number;
  prime: number;
  spUltime: number;
}

const TRIANGLE_DEFAUT: number[][] = [
  [340, 610, 790, 905, 962, 1000],
  [390, 650, 860, 990, 1056],
  [410, 720, 930, 1070],
  [470, 780, 1010],
  [500, 880],
  [540]
];

@Component({
  selector: 'app-provisions',
  standalone: true,
  imports: [
    CommonModule, FormsModule, NgApexchartsModule, PageBreadcrumbComponent,
    NiveauSwitchComponent, BandeBienvenueComponent, TermeComponent, DemarcheComponent
  ],
  templateUrl: './provisions.component.html'
})
export class ProvisionsComponent {
  readonly niveau = inject(NiveauService);

  readonly anneesSurvenance = [2020, 2021, 2022, 2023, 2024, 2025];
  readonly anneesDeveloppement = [0, 1, 2, 3, 4, 5];
  readonly primesAcquises = [1600, 1750, 1900, 2050, 2200, 2350];

  readonly triangle = signal<number[][]>(TRIANGLE_DEFAUT.map(l => [...l]));
  readonly methode = signal<Methode>('CHAIN_LADDER');
  readonly ratioSP = signal(70);

  readonly facteursDeveloppement = computed(() => {
    const tri = this.triangle();
    const facteurs: number[] = [];
    for (let j = 0; j < this.anneesDeveloppement.length - 1; j++) {
      let num = 0, den = 0;
      for (let i = 0; i < tri.length; i++) {
        if (tri[i][j] !== undefined && tri[i][j + 1] !== undefined) {
          num += tri[i][j + 1];
          den += tri[i][j];
        }
      }
      facteurs.push(den > 0 ? num / den : 1);
    }
    return facteurs;
  });

  readonly facteursCumules = computed(() => {
    const f = this.facteursDeveloppement();
    const cdf: number[] = [];
    for (let j = 0; j < this.anneesDeveloppement.length; j++) {
      let p = 1;
      for (let k = j; k < f.length; k++) p *= f[k];
      cdf.push(p);
    }
    return cdf;
  });

  readonly triangleProjete = computed(() => {
    const tri = this.triangle();
    const f = this.facteursDeveloppement();
    const proj: (number | null)[][] = [];
    for (let i = 0; i < tri.length; i++) {
      const ligne: (number | null)[] = [];
      const dernier = tri[i].length - 1;
      for (let j = 0; j < this.anneesDeveloppement.length; j++) {
        if (j <= dernier) ligne.push(tri[i][j]);
        else ligne.push((ligne[j - 1] as number) * f[j - 1]);
      }
      proj.push(ligne);
    }
    return proj;
  });

  readonly provisions = computed<LigneProvision[]>(() => {
    const tri = this.triangle();
    const cdf = this.facteursCumules();
    const methode = this.methode();
    const sp = this.ratioSP() / 100;
    const res: LigneProvision[] = [];

    for (let i = 0; i < tri.length; i++) {
      const dernier = tri[i].length - 1;
      const paye = tri[i][dernier];
      const cdfI = cdf[dernier];
      let ultime: number;

      if (methode === 'CHAIN_LADDER') {
        ultime = paye * cdfI;
      } else {
        // Bornhuetter-Ferguson CORRIGÉ
        const prime = this.primesAcquises[i];
        const expectedUltime = prime * sp;
        const pctNonPaye = 1 - (1 / cdfI);
        ultime = paye + (expectedUltime - paye) * pctNonPaye;
      }

      const prime = this.primesAcquises[i];
      res.push({
        annee: this.anneesSurvenance[i],
        dernierPaye: paye,
        cdf: cdfI,
        ultime,
        provision: ultime - paye,
        prime,
        spUltime: prime > 0 ? (ultime / prime) * 100 : 0
      });
    }
    return res;
  });

  readonly provisionTotale = computed(() =>
    this.provisions().reduce((t, p) => t + p.provision, 0)
  );

  readonly chartOptions = computed<Partial<ApexOptions>>(() => {
    const p = this.provisions();
    return {
      series: [
        { name: 'Payé', data: p.map(x => Math.round(x.dernierPaye)) },
        { name: 'Provision', data: p.map(x => Math.round(x.provision)) }
      ],
      chart: { type: 'bar', height: 320, stacked: true, fontFamily: 'Outfit, sans-serif', toolbar: { show: false } },
      colors: ['#465fff', '#7CC4B7'],
      plotOptions: { bar: { horizontal: false, columnWidth: '55%', borderRadius: 6 } },
      dataLabels: { enabled: false },
      xaxis: { categories: p.map(x => x.annee.toString()), labels: { style: { colors: '#9ca3af' } } },
      yaxis: { labels: { style: { colors: '#9ca3af' }, formatter: (v: number) => `${v} k€` } },
      grid: { borderColor: 'rgba(255,255,255,0.05)' },
      theme: { mode: 'dark' },
      legend: { labels: { colors: '#9ca3af' } }
    };
  });

  estObservee(l: number, c: number): boolean {
    return c < this.triangle()[l].length;
  }

  changerMethode(m: Methode): void {
    this.methode.set(m);
  }
}