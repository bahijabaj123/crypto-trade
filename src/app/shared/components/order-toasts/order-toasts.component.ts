import { Component, inject } from '@angular/core';

import { NotificationsOrdresService } from '../../services/notifications-ordres.service';

/** Affiche les notifications d'ordres en haut à droite de l'écran (à placer une seule fois dans le layout). */
@Component({
  selector: 'app-order-toasts',
  templateUrl: './order-toasts.component.html',
})
export class OrderToastsComponent {
  readonly service = inject(NotificationsOrdresService);
}
