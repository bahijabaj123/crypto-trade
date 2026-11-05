import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BacktestingComponent } from './backtesting.component';

describe('BacktestingComponent', () => {
  let component: BacktestingComponent;
  let fixture: ComponentFixture<BacktestingComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BacktestingComponent]
    })
      .compileComponents();

    fixture = TestBed.createComponent(BacktestingComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
