import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ModeAssureurComponent } from './mode-assureur.component';

describe('ModeAssureurComponent', () => {
  let component: ModeAssureurComponent;
  let fixture: ComponentFixture<ModeAssureurComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ModeAssureurComponent]
    })
      .compileComponents();

    fixture = TestBed.createComponent(ModeAssureurComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
