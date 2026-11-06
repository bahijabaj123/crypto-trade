import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AdminStressScenariosComponent } from './admin-stress-scenarios.component';

describe('AdminStressScenariosComponent', () => {
  let component: AdminStressScenariosComponent;
  let fixture: ComponentFixture<AdminStressScenariosComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AdminStressScenariosComponent]
    })
      .compileComponents();

    fixture = TestBed.createComponent(AdminStressScenariosComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
