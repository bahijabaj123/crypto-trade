import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ChartsCandlesComponent } from './charts-candles.component';

describe('ChartsCandlesComponent', () => {
  let component: ChartsCandlesComponent;
  let fixture: ComponentFixture<ChartsCandlesComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ChartsCandlesComponent]
    })
      .compileComponents();

    fixture = TestBed.createComponent(ChartsCandlesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
