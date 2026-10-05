import { ComponentFixture, TestBed } from '@angular/core/testing';
import { StressCompareComponent } from './stress-compare.component';

describe('StressCompareComponent', () => {
  let component: StressCompareComponent;
  let fixture: ComponentFixture<StressCompareComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [StressCompareComponent]
    })
      .compileComponents();

    fixture = TestBed.createComponent(StressCompareComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
