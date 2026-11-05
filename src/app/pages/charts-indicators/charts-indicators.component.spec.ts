import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ChartsIndicatorsComponent } from './charts-indicators.component';

describe('ChartsIndicatorsComponent', () => {
  let component: ChartsIndicatorsComponent;
  let fixture: ComponentFixture<ChartsIndicatorsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ChartsIndicatorsComponent]
    })
      .compileComponents();

    fixture = TestBed.createComponent(ChartsIndicatorsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
