import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MultiComparatorComponent } from './multi-comparator.component';

describe('MultiComparatorComponent', () => {
  let component: MultiComparatorComponent;
  let fixture: ComponentFixture<MultiComparatorComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MultiComparatorComponent]
    })
      .compileComponents();

    fixture = TestBed.createComponent(MultiComparatorComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
