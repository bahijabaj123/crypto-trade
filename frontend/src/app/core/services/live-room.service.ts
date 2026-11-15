import { Injectable, signal } from '@angular/core';

export interface ChatMessage {
  pseudo: string;
  texte: string;
  heure: string;
  isMe: boolean;
}

@Injectable({ providedIn: 'root' })
export class LiveRoomService {
  // Liste des messages du chat
  readonly messages = signal<ChatMessage[]>([]);
  
  // Impact sur le prix (ex: +0.5% si achat, -0.5% si vente)
  readonly impactPrix = signal<number>(0); 

  constructor() {
    // Au démarrage, on met un message de bienvenue
    this.messages.set([
      { pseudo: 'Système', texte: 'Bienvenue dans la Salle Vivante ! Les prix évoluent selon vos trades.', heure: new Date().toLocaleTimeString(), isMe: false }
    ]);
  }

  // Ajouter un message dans le chat
  envoyerMessage(texte: string, pseudo: string) {
    if (!texte.trim()) return;
    
    this.messages.update(msgs => [
      ...msgs, 
      { pseudo, texte, heure: new Date().toLocaleTimeString(), isMe: true }
    ]);
  }

  // Simuler l'impact d'un ordre sur le prix (à appeler quand on clique sur Acheter/Vendre)
  appliquerImpact(sens: 'ACHAT' | 'VENTE', quantite: number) {
    // Plus la quantité est grosse, plus l'impact est fort
    // Ex: 10 BTC achetés = +1% sur le prix
    const impactBase = quantite * 0.001; // 0.1% par unité (à ajuster)
    
    let nouvelImpact = this.impactPrix();
    
    if (sens === 'ACHAT') {
      nouvelImpact += impactBase;
    } else {
      nouvelImpact -= impactBase;
    }

    // On limite l'impact entre -10% et +10%
    nouvelImpact = Math.max(-10, Math.min(10, nouvelImpact));
    
    this.impactPrix.set(nouvelImpact);
  }
}