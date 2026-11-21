import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-sparkline',
  template: `
    <svg [attr.viewBox]="'0 0 ' + w + ' ' + h" class="h-28 w-full" preserveAspectRatio="none" role="img">
      <polyline [attr.points]="points" fill="none" [attr.stroke]="stroke" stroke-width="2" />
    </svg>
  `,
})
export class SparklineComponent {
  @Input({ required: true }) values: number[] = [];
  @Input() w = 320;
  @Input() h = 96;
  @Input() stroke = '#0ECB81';

  get points(): string {
    if (!this.values.length) {
      return '';
    }
    const min = Math.min(...this.values);
    const max = Math.max(...this.values);
    const span = max - min || 1;
    return this.values
      .map((v, i) => {
        const x = (i / Math.max(1, this.values.length - 1)) * this.w;
        const y = this.h - ((v - min) / span) * (this.h - 8) - 4;
        return `${x},${y}`;
      })
      .join(' ');
  }
}
