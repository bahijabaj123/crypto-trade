import { Component, Input } from '@angular/core';
import { RouterModule } from '@angular/router';
import { PracticalMission } from '../../../learning/models/formation.models';

@Component({
  selector: 'app-practical-lab',
  imports: [RouterModule],
  templateUrl: './practical-lab.component.html',
})
export class PracticalLabComponent {
  @Input({ required: true }) mission!: PracticalMission;
}
