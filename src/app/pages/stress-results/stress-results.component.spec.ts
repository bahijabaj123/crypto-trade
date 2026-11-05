import { ComponentFixture, TestBed } from '@angular/core/testing';
import { StressResultsComponent } from './stress-results.component';

describe('StressResultsComponent', () => {
  let component: StressResultsComponent;
  let fixture: ComponentFixture<StressResultsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [StressResultsComponent]
    })
      .compileComponents();

    fixture = TestBed.createComponent(StressResultsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
