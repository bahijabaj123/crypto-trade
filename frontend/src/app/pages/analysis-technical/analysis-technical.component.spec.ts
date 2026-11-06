import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AnalysisTechnicalComponent } from './analysis-technical.component';

describe('AnalysisTechnicalComponent', () => {
  let component: AnalysisTechnicalComponent;
  let fixture: ComponentFixture<AnalysisTechnicalComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AnalysisTechnicalComponent]
    })
      .compileComponents();

    fixture = TestBed.createComponent(AnalysisTechnicalComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
