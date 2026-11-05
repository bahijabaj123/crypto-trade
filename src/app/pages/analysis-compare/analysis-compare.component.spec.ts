import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AnalysisCompareComponent } from './analysis-compare.component';

describe('AnalysisCompareComponent', () => {
  let component: AnalysisCompareComponent;
  let fixture: ComponentFixture<AnalysisCompareComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AnalysisCompareComponent]
    })
      .compileComponents();

    fixture = TestBed.createComponent(AnalysisCompareComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
