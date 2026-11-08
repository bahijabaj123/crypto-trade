import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AssuranceParametriqueComponent } from './assurance-parametrique.component';

describe('AssuranceParametriqueComponent', () => {
  let component: AssuranceParametriqueComponent;
  let fixture: ComponentFixture<AssuranceParametriqueComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AssuranceParametriqueComponent]
    })
      .compileComponents();

    fixture = TestBed.createComponent(AssuranceParametriqueComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
