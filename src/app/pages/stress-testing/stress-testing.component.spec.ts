import { ComponentFixture, TestBed } from '@angular/core/testing';
import { StressTestingComponent } from './stress-testing.component';

describe('StressTestingComponent', () => {
  let component: StressTestingComponent;
  let fixture: ComponentFixture<StressTestingComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [StressTestingComponent]
    })
      .compileComponents();

    fixture = TestBed.createComponent(StressTestingComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
