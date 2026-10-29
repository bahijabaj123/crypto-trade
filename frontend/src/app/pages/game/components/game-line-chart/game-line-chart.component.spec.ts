import { ComponentFixture, TestBed } from '@angular/core/testing';
import { GameLineChartComponent } from './game-line-chart.component';

describe('GameLineChartComponent', () => {
  let component: GameLineChartComponent;
  let fixture: ComponentFixture<GameLineChartComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [GameLineChartComponent]
    })
      .compileComponents();

    fixture = TestBed.createComponent(GameLineChartComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
