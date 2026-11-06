import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PageBreadcrumbComponent } from '../../shared/components/common/page-breadcrumb/page-breadcrumb.component';
import { CryptoApiService, messageErreur } from '../../shared/services/crypto-api.service';
import { OrdreRequest, PortefeuilleVue, PositionVue } from '../../shared/models/crypto.models';

@Component({
  selector: 'app-risk',
  standalone: true,
  imports: [CommonModule, FormsModule, PageBreadcrumbComponent],
  templateUrl: './risk.component.html',
  styleUrl: './risk.component.css',
})
export class RiskComponent implements OnInit {
  private readonly api = inject(CryptoApiService);

  readonly portefeuille = signal<PortefeuilleVue | null>(null);
  readonly erreur = signal<string | null>(null);
  readonly succes = signal<string | null>(null);
  readonly chargement = signal(false);
  readonly envoiEnCours = signal(false);

  // Formulaire
  symboleSelectionne = '';
  typeProtection: 'STOP_LOSS' | 'TAKE_PROFIT' = 'STOP_LOSS';
  prixDeclenchement: number | null = null;

  ngOnInit(): void {
    this.chargerPortefeuille();
  }

  chargerPortefeuille(): void {
    this.chargement.set(true);
    this.api.getPortefeuille().subscribe({
      next: (p) => {
        this.portefeuille.set(p);
        if (p.positionsOuvertes.length > 0 && !this.symboleSelectionne) {
          this.symboleSelectionne = p.positionsOuvertes[0].symbole;
        }
        this.chargement.set(false);
      },
      error: (e) => {
        this.erreur.set(messageErreur(e));
        this.chargement.set(false);
      }
    });
  }

  get positionSelectionnee(): PositionVue | undefined {
    return this.portefeuille()?.positionsOuvertes.find(p => p.symbole === this.symboleSelectionne);
  }

  activerProtection(): void {
    if (!this.symboleSelectionne || !this.prixDeclenchement || this.prixDeclenchement <= 0) {
      this.erreur.set('Veuillez choisir un actif et un prix valide.');
      return;
    }

    const pos = this.positionSelectionnee;
    if (!pos) return;

    // 👇 CORRECTION ICI : on vérifie que prixActuel n'est pas null avant de comparer
    const prixActuel = pos.prixActuel;
    if (prixActuel === null) {
      this.erreur.set('Le prix actuel est indisponible, réessayez dans un instant.');
      return;
    }

    if (this.typeProtection === 'STOP_LOSS' && this.prixDeclenchement >= prixActuel) {
      this.erreur.set('Le Stop-Loss doit être inférieur au prix actuel.');
      return;
    }
    if (this.typeProtection === 'TAKE_PROFIT' && this.prixDeclenchement <= prixActuel) {
      this.erreur.set('Le Take-Profit doit être supérieur au prix actuel.');
      return;
    }

    this.envoiEnCours.set(true);
    this.erreur.set(null);
    this.succes.set(null);

    const req: OrdreRequest = {
      symbole: this.symboleSelectionne,
      sens: 'VENTE', // On vend pour sécuriser
      type: this.typeProtection,
      quantite: pos.quantite,
      prixDeclenchement: this.prixDeclenchement
    };

    this.api.passerOrdre(req).subscribe({
      next: (res) => {
        this.succes.set(`Ordre ${this.typeProtection} placé avec succès à ${this.prixDeclenchement} USDT pour ${pos.quantite} ${pos.symbole}.`);
        this.prixDeclenchement = null;
        this.envoiEnCours.set(false);
        this.chargerPortefeuille();
      },
      error: (e) => {
        this.erreur.set(messageErreur(e));
        this.envoiEnCours.set(false);
      }
    });
  }
}