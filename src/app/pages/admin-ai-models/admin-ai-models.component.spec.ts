import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AdminAiModelsComponent } from './admin-ai-models.component';

describe('AdminAiModelsComponent', () => {
  let component: AdminAiModelsComponent;
  let fixture: ComponentFixture<AdminAiModelsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AdminAiModelsComponent]
    })
      .compileComponents();

    fixture = TestBed.createComponent(AdminAiModelsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
