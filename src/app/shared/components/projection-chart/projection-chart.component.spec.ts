import { provideHttpClient } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ProjectionChartComponent } from './projection-chart.component';

describe('ProjectionChartComponent', () => {
  let fixture: ComponentFixture<ProjectionChartComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ProjectionChartComponent],
      providers: [provideHttpClient()],
    }).compileComponents();

    fixture = TestBed.createComponent(ProjectionChartComponent);
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(fixture.componentInstance).toBeTruthy();
  });
});
