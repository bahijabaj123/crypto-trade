import { Component, Input } from '@angular/core';
import { SafeHtmlPipe } from '../../../pipe/safe-html.pipe';

@Component({
  selector: 'app-learning-stat-card',
  imports: [SafeHtmlPipe],
  templateUrl: './learning-stat-card.component.html',
})
export class LearningStatCardComponent {
  @Input({ required: true }) label!: string;
  @Input({ required: true }) value!: string;
  @Input() hint = '';
  @Input() iconSvg = '';
}
